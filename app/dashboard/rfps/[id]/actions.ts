"use server";

import { revalidatePath } from "next/cache";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";
import { openRouterChat, openRouterKeys } from "@/lib/openrouter";
import type { QuestionLane, RfpRow } from "@/lib/supabase/types";
import { attachStandingDocuments, fileProposal, folderIdFrom, moveToLane } from "@/lib/drive";
import { caravannTemplate } from "@/lib/template-store";
import { assembleProposalDocx } from "@/lib/proposal-document";
import { proposalFileName } from "@/lib/proposal";
import { tailorPrompt, vetTailored } from "@/lib/tailor";
import { ADAPTIVE_SECTIONS, cleanComposed, composePrompt, rankEngagements, vetComposed } from "@/lib/compose";
import { assembleDraft, DEFAULT_SECTIONS } from "@/lib/proposal";
import { recommendTeam } from "@/lib/team-match";

/**
 * Truncate, and say so.
 *
 * A silent `.slice()` on the requirements is the difference between a proposal
 * that answers the solicitation and one that answers most of it, and there is
 * no way to tell them apart by reading the output.
 */
function capped(values: string[], limit: number, label: string): string[] {
  if (values.length > limit) {
    console.warn(`[compose] ${values.length - limit} of ${values.length} ${label} did not fit the prompt (cap ${limit}).`);
  }
  return values.slice(0, limit);
}

// Server actions rather than API routes: these are user-initiated from the
// dashboard, so they run under the caller's own session and stay subject to
// the RLS allowlist. The service-role client is reserved for n8n's machine
// path, where there is no user to act as.

export async function buildDraft(rfpId: string): Promise<ActionResult<{ drafted: number; needsInput: number; preserved: number }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const [{ data: rfp }, { data: blocks }, { data: addenda }] = await Promise.all([
    supabase.from("rfps").select("*").eq("id", rfpId).maybeSingle(),
    supabase.from("language_blocks").select("*"),
    supabase.from("rfp_related_documents").select("kind, sequence").eq("rfp_id", rfpId),
  ]);

  if (!rfp) return { error: "RFP not found" };

  const sections = assembleDraft(rfp, blocks ?? [], DEFAULT_SECTIONS, addenda ?? []);

  // The sections a library cannot hold, written from the analysis instead.
  //
  // Reading Caravann's real SamTrans submission made the split clear: the
  // skeleton was right, but the sections carrying the work are written fresh
  // for each client every time. Those came back "needs writing by hand" and
  // always would have, because there is nothing reusable to stitch.
  //
  // Everything they are built from is already in the database, put there by
  // triage: the tasks the agency stated, the rules it will be judged against,
  // the gaps found, and the people confirmed onto the bid.
  const composed = await composeAdaptiveSections(supabase, rfpId, rfp, sections);
  for (const section of sections) {
    const text = composed.get(section.section_type);
    if (!text) continue;
    section.body = text;
    section.status = "draft";
    section.notes = "Written for this solicitation from the analysis.";
  }

  // Replace wholesale so a rebuild after adding library material doesn't
  // leave stale sections behind. Approved sections are preserved - losing a
  // human's edits to an automated rebuild would be unforgivable.
  const { data: existing } = await supabase
    .from("rfp_proposal_sections")
    .select("section_type,status,body")
    .eq("rfp_id", rfpId);

  const approved = new Map(
    (existing ?? []).filter((s) => s.status === "approved").map((s) => [s.section_type, s])
  );

  await supabase
    .from("rfp_proposal_sections")
    .delete()
    .eq("rfp_id", rfpId)
    .neq("status", "approved");

  // Named columns, not a spread. `assembleDraft` returns the section
  // definition it was given, and those definitions grew a field the table does
  // not have - `attachment`, marking the three appendix slots - which turned
  // every build into "Could not build the draft. The detail is in the server
  // log". Spreading a shape somebody else owns into an insert means any field
  // added there becomes a runtime failure here, discovered by a person
  // pressing a button.
  const rows = sections
    .filter((s) => !approved.has(s.section_type))
    .map((s) => ({
      rfp_id: rfpId,
      section_type: s.section_type,
      heading: s.heading,
      body: s.body,
      status: s.status,
      sort_order: s.sort_order,
      source_block_ids: s.source_block_ids,
      notes: s.notes,
    }));

  if (rows.length) {
    const { error } = await supabase.from("rfp_proposal_sections").insert(rows);
    if (error) return safeError("build the draft", error);
  }

  // Straight to Drive, so "open the draft" can mean opening a document rather
  // than downloading one. Never allowed to fail the build: the sections are
  // already saved and correct by this point, and reporting failure because
  // Drive was briefly unreachable would be a lie about the thing that matters.
  const folderId = folderIdFrom(rfp.drive_folder_url);
  if (folderId) {
    try {
      const template = await caravannTemplate();
      // Tailored text wins where it exists, for the same reason the download
      // uses it: filing the untailored original would make the pass theatre.
      const { data: current } = await supabase
        .from("rfp_proposal_sections")
        .select("heading,body,tailored_body")
        .eq("rfp_id", rfpId);
      // Only the real template. A document that does not match Caravann's own
      // furniture is not worth putting in the bid folder under its name.
      if (template) {
        // The firm's own cover-page details, read from the profile rather than
        // from a constant in the template filler.
        const { data: firm } = await supabase
          .from("org_profile")
          .select("legal_name, address, point_of_contact, telephone, email, website, cage_code, uei, duns, tax_ein")
          .eq("id", true)
          .maybeSingle();

        const { data: engagements } = await supabase.from("past_engagements").select("*");
        const { data: addenda } = await supabase
          .from("rfp_related_documents")
          .select("title, sequence, received_at")
          .eq("rfp_id", rfpId)
          .eq("kind", "addendum")
          .order("sequence");

        const buffer = await assembleProposalDocx({
          rfp,
          sections: current ?? [],
          engagements: engagements ?? [],
          addenda: addenda ?? [],
          firm: firm ?? null,
        });
        if (!buffer) throw new Error("template unavailable");
        const docUrl = await fileProposal(folderId, `${proposalFileName(rfp)}.docx`, buffer);
        if (docUrl) await supabase.from("rfps").update({ proposal_doc_url: docUrl }).eq("id", rfpId);

        // The standing documents, into the same folder as the draft.
        //
        // Here rather than at intake because this is the moment a submission
        // starts existing. A bid nobody has drafted does not need an insurance
        // certificate sitting next to it, and filing one there would put a
        // stale copy in every folder Khaled never pursued.
        const { data: standing } = await supabase
          .from("standing_documents")
          .select("label, file_name, storage_path, expires_on");

        if (standing?.length) {
          const files = [];
          for (const doc of standing) {
            const { data: blob } = await supabase.storage
              .from("client-documents")
              .download(doc.storage_path);
            if (!blob) continue;
            files.push({
              label: doc.label,
              file_name: doc.file_name,
              expires_on: doc.expires_on,
              bytes: Buffer.from(await blob.arrayBuffer()),
            });
          }
          if (files.length) await attachStandingDocuments(folderId, files);
        }
      }
    } catch {
      /* the draft stands either way */
    }
  }

  // Keep this build before the next one replaces it.
  //
  // Rebuilding overwrites rfp_proposal_sections and files a fresh Doc, so
  // until now the previous draft survived only as an orphaned Drive file with
  // the same name as its replacement. A rebuild after a bad edit could not be
  // undone and there was no way to see what an amendment had changed.
  //
  // After the filing block, so the snapshot carries the Doc this build
  // produced. Wrapped, and never allowed to fail the build, for the same
  // reason Drive is not: the sections are already saved and correct, and
  // failing here would report a broken build that isn't.
  try {
    const { data: built } = await supabase
      .from("rfp_proposal_sections")
      .select("heading, body, tailored_body, notes")
      .eq("rfp_id", rfpId)
      .order("sort_order");
    const { data: filed } = await supabase
      .from("rfps")
      .select("proposal_doc_url")
      .eq("id", rfpId)
      .maybeSingle();
    const sections = built ?? [];
    const text = sections
      .map((x) => `${x.heading}\n\n${x.tailored_body ?? x.body ?? ""}`)
      .join("\n\n");
    // Monotonic per bid rather than a sequence, because it restarts per rfp
    // and "version 3" should mean the third build of *this* proposal.
    const { data: last } = await supabase
      .from("proposal_versions")
      .select("version")
      .eq("rfp_id", rfpId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    await supabase.from("proposal_versions").insert({
      rfp_id: rfpId,
      version: (last?.version ?? 0) + 1,
      word_count: text.split(/\s+/).filter(Boolean).length,
      section_count: sections.length,
      // The number that says whether the build actually composed anything. A
      // zero here is the silent-fallback signature.
      written_count: sections.filter((x) => x.notes?.startsWith("Written")).length,
      doc_url: filed?.proposal_doc_url ?? null,
      body: text,
    });
  } catch (err) {
    console.error(`[build ${rfpId}] could not record the version:`, (err as Error).message);
  }

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  revalidatePath(`/dashboard/proposals/${rfpId}`);
  return {
    ok: true,
    drafted: rows.filter((r) => r.status === "draft").length,
    needsInput: rows.filter((r) => r.status === "needs_input").length,
    preserved: approved.size,
  };
}

/**
 * Record what a human actually decided.
 *
 * Deliberately does not touch `status`. The computed verdict stays exactly as
 * it was, because the point is the *gap* between the two - overwriting it would
 * destroy the only evidence of whether the desk is any good. The UI shows the
 * human call as the one that counts; the machine call stays underneath it.
 *
 * Passing null clears the override, so a mis-click is recoverable.
 */
export async function setHumanVerdict(
  rfpId: string,
  verdict: "go" | "no_go" | "maybe" | null,
  note: string
): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const { error } = await supabase
    .from("rfps")
    .update({
      human_verdict: verdict,
      human_verdict_at: verdict ? new Date().toISOString() : null,
      // The note is the valuable part, so it is kept whenever there is one -
      // including on a verdict that agrees with the desk, where "right call,
      // but only because we know the incumbent" is worth having.
      human_verdict_note: verdict ? note.trim() || null : null,
    })
    .eq("id", rfpId);
  if (error) return safeError("record your decision", error);

  // The folder follows the decision. Declined is a lane, never a deletion: the
  // folder holds the solicitation as the agency sent it, and "did we see this?"
  // is a real question six months later.
  const { data: bid } = await supabase
    .from("rfps")
    .select("drive_folder_url")
    .eq("id", rfpId)
    .maybeSingle();
  const folderId = folderIdFrom(bid?.drive_folder_url ?? null);
  if (folderId && verdict) {
    void moveToLane(folderId, verdict === "no_go" ? "Declined" : verdict === "go" ? "Go" : "Maybe");
  }

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/proposals");
  return { ok: true };
}

export async function approveSection(rfpId: string, sectionId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_proposal_sections")
    .update({ status: "approved" })
    .eq("id", sectionId);
  if (error) return safeError("approve the section", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

export async function matchTeam(rfpId: string): Promise<ActionResult<{ recommended: number }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const [{ data: members }, { data: checks }] = await Promise.all([
    supabase.from("team_members").select("*"),
    supabase.from("rfp_disqualifier_checks").select("requirement_text,is_required").eq("rfp_id", rfpId),
  ]);

  const picks = recommendTeam(members ?? [], checks ?? []);
  if (!picks.length) return { error: "No active team members to recommend" };

  // Only clear recommendations - a confirmed assignment is Khaled's decision
  // and re-running the matcher must not silently undo it.
  await supabase
    .from("rfp_team_assignments")
    .delete()
    .eq("rfp_id", rfpId)
    .eq("status", "recommended");

  const { data: confirmed } = await supabase
    .from("rfp_team_assignments")
    .select("team_member_id")
    .eq("rfp_id", rfpId);
  const already = new Set((confirmed ?? []).map((c) => c.team_member_id));

  const rows = picks
    .filter((p) => !already.has(p.team_member_id))
    .map((p) => ({
      rfp_id: rfpId,
      team_member_id: p.team_member_id,
      status: "recommended" as const,
      match_reason: p.match_reason,
      match_score: p.match_score,
    }));

  if (rows.length) {
    const { error } = await supabase.from("rfp_team_assignments").insert(rows);
    if (error) return safeError("save the recommendations", error);
  }

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true, recommended: rows.length };
}

/**
 * Put someone on a bid the matcher did not suggest.
 *
 * The matcher returns three names from a roster of thirteen, ranked on word
 * overlap with the stated requirements - which is a useful prompt and a poor
 * substitute for knowing that a particular client asked for a particular
 * person. Without this the panel was read-only in the one direction that
 * matters: Khaled could accept a suggestion or re-run it, never disagree with
 * it.
 *
 * Recorded `confirmed` rather than `recommended`, because a person choosing
 * someone is not a suggestion awaiting approval - it is the approval. It also
 * means re-running the match cannot quietly remove them, since that only clears
 * recommendations.
 */
export async function assignMember(rfpId: string, memberId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const { data: existing } = await supabase
    .from("rfp_team_assignments")
    .select("id")
    .eq("rfp_id", rfpId)
    .eq("team_member_id", memberId)
    .maybeSingle();

  // Already suggested: promote that row rather than adding a second one for the
  // same person, which would show them twice.
  if (existing) {
    const { error } = await supabase
      .from("rfp_team_assignments")
      .update({ status: "confirmed" })
      .eq("id", existing.id);
    if (error) return safeError("add them to the team", error);
  } else {
    const { error } = await supabase.from("rfp_team_assignments").insert({
      rfp_id: rfpId,
      team_member_id: memberId,
      status: "confirmed",
      match_reason: "Added by hand",
      match_score: null,
    });
    if (error) return safeError("add them to the team", error);
  }

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/**
 * Tick a compliance item off, or untick it.
 *
 * The checklist rendered its tick as a styled span, so it showed state and
 * accepted nothing: the one module promising a list that "ticks off live as
 * each required piece is attached" was a picture of a checklist. Every other
 * human step on this page writes something; this one had no action behind it at
 * all.
 *
 * Takes the value rather than flipping what it reads, so two clicks in quick
 * succession cannot race into the wrong state.
 */
export async function setComplianceComplete(
  rfpId: string,
  itemId: string,
  complete: boolean
): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const { error } = await supabase
    .from("rfp_compliance_items")
    .update({ is_complete: complete })
    .eq("id", itemId)
    .eq("rfp_id", rfpId);
  if (error) return safeError("update that item", error);

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/**
 * Take a confirmed person back off the bid.
 *
 * Confirming was one-way, so a person put on a bid by mistake stayed on it, and
 * the only route back was removing them and running the match again - which
 * also discards every other decision on that panel.
 *
 * Returns them to "recommended" rather than deleting the row. They were a
 * sensible suggestion before being confirmed and they still are; deleting would
 * lose the match reason and the score that explained why.
 */
export async function unconfirmAssignment(rfpId: string, assignmentId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_team_assignments")
    .update({ status: "recommended" })
    .eq("id", assignmentId);
  if (error) return safeError("take them off the bid", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

export async function confirmAssignment(rfpId: string, assignmentId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_team_assignments")
    .update({ status: "confirmed" })
    .eq("id", assignmentId);
  if (error) return safeError("confirm the assignment", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/** Approving a question is a human act and is recorded as one. Sending is
 *  separate and not wired: the SOW requires Khaled to send the records-request
 *  lane himself, and there is no mail credential in this build.
 *
 *  Approval is also the only learning signal in the system. A drafted question
 *  is the desk's opinion; an approved one is a person saying it was worth
 *  asking, so that is the moment it enters the bank. */
export async function approveQuestion(rfpId: string, questionId: string): Promise<ActionResult> {
  const { supabase, user, denied } = await requireUser();
  if (denied) return denied;

  const { data: question, error } = await supabase
    .from("rfp_questions")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.email ?? null,
    })
    .eq("id", questionId)
    .select("lane, question_text")
    .maybeSingle();
  if (error) return safeError("approve the question", error);

  if (question) await rememberQuestion(supabase, question.lane, question.question_text);

  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/**
 * Add an approved question to the bank, or count it again if it is already
 * there.
 *
 * Deliberately never fails the approval. Banking is a side benefit, and a
 * unique-constraint race between two tabs approving the same question must not
 * surface to the person as "could not approve", which would be both wrong and
 * alarming - the approval already succeeded by the time this runs.
 */
async function rememberQuestion(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  lane: QuestionLane,
  text: string,
): Promise<void> {
  const normalised = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
  try {
    const { data: seen } = await supabase
      .from("question_bank")
      .select("id, times_approved")
      .eq("lane", lane)
      .eq("normalised", normalised)
      .maybeSingle();

    if (seen) {
      await supabase
        .from("question_bank")
        .update({
          times_approved: seen.times_approved + 1,
          last_approved_at: new Date().toISOString(),
        })
        .eq("id", seen.id);
      return;
    }
    await supabase.from("question_bank").insert({ lane, question_text: text.trim() });
  } catch {
    /* the approval stands either way */
  }
}

/**
 * Turn a question down, on the record.
 *
 * Without this, "no" was expressed by doing nothing, so a question Khaled had
 * read and rejected was indistinguishable from one he had not reached yet.
 *
 * Deliberately does not touch the bank. The bank learns from approval, and a
 * declined question is not evidence that a similar question is bad next time -
 * it is usually evidence that this document already answered it.
 */
export async function declineQuestion(rfpId: string, questionId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const { error } = await supabase
    .from("rfp_questions")
    .update({ status: "declined", declined_at: new Date().toISOString() })
    .eq("id", questionId);
  if (error) return safeError("decline the question", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/** Records that an approved question was sent by hand. No mail is dispatched
 *  from here - this marks what a human already did, so the memo doesn't get
 *  sent twice. */
export async function markQuestionSent(rfpId: string, questionId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_questions")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", questionId);
  if (error) return safeError("mark the question sent", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/**
 * Adapt one section to this solicitation.
 *
 * One section at a time, and only when asked. Tailoring costs a model call, and
 * a button that quietly spends ten of them because somebody opened a page is
 * how a balance disappears without anybody deciding to spend it.
 *
 * The stitched text is never overwritten. What comes back is vetted against
 * both the approved language and the solicitation, and anything asserting
 * something neither of them says is thrown away with a reason, because the
 * alternative is a false claim in a document sent to a government buyer.
 */
export async function tailorSection(rfpId: string, sectionId: string): Promise<ActionResult<{ changed: boolean; note: string }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  // Any configured account will do, not one specific variable.
  //
  // This read OPENROUTER_API_KEY directly. The moment the official slot was
  // emptied and the working key moved to the backup slot, this returned early
  // and the composer never ran: a full pipeline test produced fourteen
  // sections, 2,880 words, and not one of them written for the bid - with no
  // error anywhere, because nothing had failed. It had simply not been asked.
  if (openRouterKeys().length === 0) {
    return { error: "No OpenRouter account is configured, so nothing can be tailored." };
  }

  // The analysis the desk already paid to produce. Reading it here is the
  // difference between a section adapted to this solicitation and one with the
  // agency's name pasted into it.
  const [{ data: section }, { data: rfp }, { data: checks }, { data: rules }, { data: gaps }] =
    await Promise.all([
      supabase.from("rfp_proposal_sections").select("*").eq("id", sectionId).maybeSingle(),
      supabase.from("rfps").select("title,client_agency,solicitation_number,verdict_why").eq("id", rfpId).maybeSingle(),
      supabase.from("rfp_disqualifier_checks").select("requirement_text").eq("rfp_id", rfpId),
      supabase.from("rfp_compliance_items").select("label, detail").eq("rfp_id", rfpId),
      supabase.from("rfp_gap_items").select("description").eq("rfp_id", rfpId),
    ]);
  if (!section?.body || !rfp) return { error: "Nothing to tailor in that section." };

  // What the solicitation itself says, which the tailored text is allowed to
  // draw on without it counting as invention.
  const solicitation = [rfp.title, rfp.client_agency, rfp.solicitation_number, rfp.verdict_why]
    .filter(Boolean)
    .join(". ");

  let reply: string;
  try {
    const attempt = await openRouterChat({
        model: "anthropic/claude-sonnet-5",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: tailorPrompt({
              agency: rfp.client_agency,
              title: rfp.title,
              solicitationNumber: rfp.solicitation_number,
              scopeNotes: rfp.verdict_why ?? "",
              requirements: (checks ?? []).map((c) => c.requirement_text).filter(Boolean).slice(0, 12),
              rules: (rules ?? [])
                .map((r) => [r.label, r.detail].filter(Boolean).join(": "))
                .filter(Boolean)
                .slice(0, 10),
              gaps: (gaps ?? []).map((g) => g.description).filter(Boolean).slice(0, 8),
            }),
          },
          { role: "user", content: `SECTION: ${section.heading}\n\n${section.body}` },
        ],
      },
      { signal: AbortSignal.timeout(60000) },
    );
    if (!attempt.ok) {
      if (attempt.outOfCredit) {
        return {
          error:
            "Every OpenRouter account is out of credit, so nothing can be drafted or triaged until one is topped up at openrouter.ai/settings/credits.",
        };
      }
      return { error: `OpenRouter refused the request (${attempt.status}).` };
    }
    const res = attempt.response;
    const json = await res.json();
    reply = String(json?.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return { error: "Could not reach OpenRouter. The stitched text is unchanged." };
  }

  const rejected = vetTailored(section.body, reply, solicitation);
  if (rejected) {
    return { ok: true, changed: false, note: `Kept the approved text. The rewrite ${rejected}.` };
  }
  if (reply.trim() === section.body.trim()) {
    return { ok: true, changed: false, note: "Nothing to change: the approved text already fits." };
  }

  const { error } = await supabase
    .from("rfp_proposal_sections")
    .update({ tailored_body: reply, tailored_at: new Date().toISOString(), status: "draft" })
    .eq("id", sectionId);
  if (error) return safeError("save the tailored section", error);

  revalidatePath(`/dashboard/proposals/${rfpId}`);
  return { ok: true, changed: true, note: "Tailored. The approved original is kept underneath." };
}

/** Put a section back to the language it was stitched from. */
export async function revertTailoring(rfpId: string, sectionId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfp_proposal_sections")
    .update({ tailored_body: null, tailored_at: null })
    .eq("id", sectionId);
  if (error) return safeError("restore the approved text", error);
  revalidatePath(`/dashboard/proposals/${rfpId}`);
  return { ok: true };
}

/**
 * Record that a person has read the amendments on a bid.
 *
 * Only clears the flag. It does not re-triage, re-score or touch the verdict,
 * because reading an amendment and deciding what it means are different acts,
 * and the second one is Khaled's.
 */
export async function markAmendmentReviewed(rfpId: string): Promise<ActionResult> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;
  const { error } = await supabase
    .from("rfps")
    .update({ has_unreviewed_amendment: false })
    .eq("id", rfpId);
  if (error) return safeError("mark the amendments read", error);
  revalidatePath(`/dashboard/rfps/${rfpId}`);
  return { ok: true };
}

/**
 * Draft every adaptive section for one bid, in parallel.
 *
 * Returns a map rather than mutating, so a section that fails vetting simply
 * has no entry and keeps whatever the library gave it. A composed section that
 * cannot be trusted is worse than an honest "needs writing by hand".
 */
async function composeAdaptiveSections(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  rfpId: string,
  rfp: RfpRow,
  sections: { section_type: string; heading: string }[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // Any configured account will do, not one specific variable.
  //
  // This read OPENROUTER_API_KEY directly. The moment the official slot was
  // emptied and the working key moved to the backup slot, this returned early
  // and the composer never ran: a full pipeline test produced fourteen
  // sections, 2,880 words, and not one of them written for the bid - with no
  // error anywhere, because nothing had failed. It had simply not been asked.
  if (openRouterKeys().length === 0) return out;

  const wanted = sections.filter((s) => s.section_type in ADAPTIVE_SECTIONS);
  if (wanted.length === 0) return out;

  // Caravann's own language, so a composed section can state facts the firm
  // already publishes rather than describing its practice areas in the
  // abstract. A real won engagement was sitting unread in the library while
  // Past Performance talked about "lines of practice".
  const { data: library } = await supabase.from("language_blocks").select("section_type, title, body, won");

  // Ordered, and `is_required` carried.
  //
  // These three feed the prompt through a `.slice(0, N)` further down, and
  // none of them had an ORDER BY. Postgres does not promise row order without
  // one, so on a solicitation with more requirements than the cap the composer
  // saw an arbitrary subset - and could see a *different* arbitrary subset on
  // the next build of the same bid. Nothing logged the drop, so the first
  // symptom would have been two drafts of one proposal disagreeing about what
  // the RFP asks for.
  //
  // `is_required` was being dropped on the way in, which left the composer
  // unable to tell "shall carry $2,000,000 insurance" from "it is preferred
  // that the team include a local consultant". It now comes through and sorts
  // first, so if anything is cut it is a preference rather than a mandate.
  const [{ data: checks }, { data: rules }, { data: gaps }, { data: assigned }, { data: roster }, { data: profile }, { data: engagements }, { data: amendments }] =
    await Promise.all([
      supabase
        .from("rfp_disqualifier_checks")
        .select("requirement_text, is_required")
        .eq("rfp_id", rfpId)
        .order("is_required", { ascending: false })
        .order("requirement_text"),
      supabase
        .from("rfp_compliance_items")
        .select("label, detail")
        .eq("rfp_id", rfpId)
        .order("label"),
      supabase.from("rfp_gap_items").select("description").eq("rfp_id", rfpId).order("description"),
      supabase.from("rfp_team_assignments").select("team_member_id").eq("rfp_id", rfpId).eq("status", "confirmed"),
      supabase.from("team_members").select("id, name, role, responsibilities, bio, credentials, years_experience"),
      supabase
        .from("org_profile")
        .select("capabilities, bilingual_staff, media_production_capable, pr_capable")
        .eq("id", true)
        .maybeSingle(),
      supabase.from("past_engagements").select("*"),
      // What the addenda actually changed, not merely that they exist. An
      // amendment routinely moves a page limit, a deadline or a scope item,
      // and the draft was being written against the original document.
      supabase
        .from("rfp_related_documents")
        .select("title, sequence, body")
        .eq("rfp_id", rfpId)
        .eq("kind", "addendum")
        .order("sequence"),
    ]);

  const byId = new Map((roster ?? []).map((m) => [m.id, m]));
  const team = (assigned ?? [])
    .map((a) => byId.get(a.team_member_id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({
      name: m.name,
      role: m.role,
      responsibilities: m.responsibilities,
      bio: m.bio,
      credentials: m.credentials,
      years_experience: m.years_experience,
    }));

  // Capped, and the cap is about leaving room for the answer.
  //
  // Ingesting a proposal put twenty-two technical blocks in the library, all of
  // which were then fed into the prompt: 24,857 characters of input, the
  // response truncated after its first heading, and the section fell back to a
  // stitch of those same twenty-two blocks. More source material produced a
  // worse section.
  //
  // The composer needs enough of Caravann's voice to write in it, not the
  // entire library. Wins first, then longest, because a substantial block shows
  // more of how the firm writes than a one-line one.
  const SOURCE_PER_SECTION = 6;
  const forSection = (type: string) =>
    (library ?? [])
      .filter((b) => b.section_type === type)
      .sort((a, b) => Number(b.won) - Number(a.won) || (b.body?.length ?? 0) - (a.body?.length ?? 0))
      .slice(0, SOURCE_PER_SECTION)
      .map((b) => ({ title: b.title, body: b.body, won: Boolean(b.won) }));

  const base = {
    agency: rfp.client_agency,
    title: rfp.title,
    solicitationNumber: rfp.solicitation_number,
    // Marked, so a mandate reads as one, and counted, so a cap that bites says
    // so in the build log instead of quietly shortening the RFP.
    requirements: capped(
      (checks ?? [])
        .filter((c) => c.requirement_text)
        .map((c) => `${c.is_required ? "[required] " : "[preferred] "}${c.requirement_text}`),
      14,
      "requirements",
    ),
    rules: capped(
      (rules ?? []).map((r) => [r.label, r.detail].filter(Boolean).join(": ")).filter(Boolean),
      12,
      "compliance rules",
    ),
    gaps: capped((gaps ?? []).map((g) => g.description).filter(Boolean) as string[], 8, "gaps"),
    amendments: (amendments ?? [])
      .filter((a) => a.body)
      .map((a) => `${a.title ?? `Addendum ${a.sequence ?? ""}`.trim()}: ${a.body}`),
    team,
    capabilities: [
      ...(profile?.capabilities?.subject_areas ?? []),
      ...(profile?.capabilities?.key_capabilities ?? []),
    ].slice(0, 14),
    // The negatives, which the composer was never given. Only flags recorded
    // as false are sent: an unanswered flag is not a denial, and telling the
    // model Caravann lacks something nobody has said either way about would
    // be inventing a limitation instead of an ability.
    cannot: [
      profile?.bilingual_staff === false ? "bilingual English and Spanish delivery" : null,
      profile?.media_production_capable === false ? "media production" : null,
      profile?.pr_capable === false ? "public relations and communications" : null,
    ].filter((x): x is string => Boolean(x)),
    dueDate: rfp.due_at?.slice(0, 10) ?? null,
    budget: rfp.budget_amount,
    costWeight: rfp.cost_weight_percent ?? null,
    // Chosen by overlap with this solicitation rather than left to the model,
    // which would pick the most impressive rather than the most relevant.
    engagements: rankEngagements(
      engagements ?? [],
      [rfp.title, rfp.project_type, rfp.client_agency].filter(Boolean).join(" "),
    ),
  };

  // In parallel. Four sequential model calls is most of a minute of somebody
  // watching a progress bar for no reason.
  await Promise.all(
    wanted.map(async (s) => {
      try {
        const source = forSection(s.section_type);
        const context = { ...base, source };

        // Two attempts, the second told what was wrong with the first.
        //
        // A rejection used to mean the section silently fell back to a stitch
        // of library blocks. That is a heavy price for one correctable
        // sentence: Scope was rejected for naming a bilingual facilitator the
        // firm does not have and dropped from about 1,400 written words to 287
        // stitched ones, losing the phase plan, the deliverables and the level
        // of effort along with the bad clause. The guard was right and the
        // proposal still got worse.
        //
        // One retry, because the failures worth recovering from are the ones
        // where the model wrote something good and overstepped in a line of
        // it. If it oversteps twice the stitch is the honest answer.
        let text = "";
        let lastReason = "";
        for (let attempt = 0; attempt < 2; attempt++) {
        const call = await openRouterChat({
            model: "anthropic/claude-sonnet-5",
            temperature: 0,
            // Enough room for the longest section. Without it the technical
            // description is truncated mid-sentence, and a proposal that stops
            // halfway through its own risk register is worse than a short one.
            // The technical section is the longest thing composed, and its
            // four required parts do not fit in eight thousand.
            max_tokens: s.section_type === "technical_description" ? 12000 : 8000,
            messages: [
              { role: "system", content: composePrompt(s.section_type, context) },
              {
                role: "user",
                content: lastReason
                  ? `Draft the ${s.section_type} section again. The previous attempt was rejected because it ${lastReason}. Fix that specifically and change nothing else about the approach.`
                  : `Draft the ${s.section_type} section.`,
              },
            ],
          },
          {
            // Three minutes, not ninety seconds. Asking for a 3,000 word section
            // and then timing out at ninety seconds silently dropped the longest
            // and most important section back to the library stitch: the request
            // that mattered most was the only one guaranteed to fail.
            signal: AbortSignal.timeout(180000),
          },
        );
        if (!call.ok) {
          // Say which failure this was, because they are not the same problem.
          //
          // Every non-OK response used to return here, so the section fell back
          // to a stitch of library blocks and the draft came out quietly
          // shorter with nothing anywhere saying why. Running out of credit is
          // the case that matters: it fails every section of every proposal
          // until somebody tops the account up, and it looked identical to the
          // model simply having an opinion about one section.
          if (call.outOfCredit) {
            console.error(
              `[compose ${rfpId}] every OpenRouter account is out of credit - ${s.section_type} and every other written section will fall back to the library until one is topped up. https://openrouter.ai/settings/credits`,
            );
          } else {
            console.error(`[compose ${rfpId}] ${s.section_type} failed: OpenRouter ${call.status} ${call.detail.slice(0, 200)}`);
          }
          return;
        }
        const json = await call.response.json();
        const raw = String(json?.choices?.[0]?.message?.content ?? "").trim();
        text = cleanComposed(raw, s.heading);
        const grounded = source.map((b) => b.body).join(" ");
        const verdict = vetComposed(
          text,
          team.map((m) => m.name),
          grounded,
          s.section_type,
          base.cannot,
        );
        if (verdict.ok) {
          out.set(s.section_type, text);
          if (attempt > 0) console.info(`[compose ${rfpId}] ${s.section_type} passed on retry.`);
          return;
        }
        lastReason = verdict.reason;
        console.info(
          `[compose ${rfpId}] ${s.section_type} rejected (attempt ${attempt + 1}): ${verdict.reason}`,
        );
        }
      } catch {
        /* the stitched version stands */
      }
    }),
  );

  return out;
}
