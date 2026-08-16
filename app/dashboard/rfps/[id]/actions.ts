"use server";

import { revalidatePath } from "next/cache";
import { requireUser, safeError, type ActionResult } from "@/lib/auth";
import type { QuestionLane } from "@/lib/supabase/types";
import { fileProposal, folderIdFrom, moveToLane } from "@/lib/drive";
import { caravannTemplate } from "@/lib/template-store";
import { fillTemplate } from "@/lib/docx-fill";
import { proposalFileName } from "@/lib/proposal";
import { tailorPrompt, vetTailored } from "@/lib/tailor";
import { assembleDraft, DEFAULT_SECTIONS } from "@/lib/proposal";
import { recommendTeam } from "@/lib/team-match";

// Server actions rather than API routes: these are user-initiated from the
// dashboard, so they run under the caller's own session and stay subject to
// the RLS allowlist. The service-role client is reserved for n8n's machine
// path, where there is no user to act as.

export async function buildDraft(rfpId: string): Promise<ActionResult<{ drafted: number; needsInput: number; preserved: number }>> {
  const { supabase, denied } = await requireUser();
  if (denied) return denied;

  const [{ data: rfp }, { data: blocks }] = await Promise.all([
    supabase.from("rfps").select("*").eq("id", rfpId).maybeSingle(),
    supabase.from("language_blocks").select("*"),
  ]);

  if (!rfp) return { error: "RFP not found" };

  const sections = assembleDraft(rfp, blocks ?? [], DEFAULT_SECTIONS);

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
      const body = Object.fromEntries(
        (current ?? [])
          .map((r) => [r.heading, r.tailored_body ?? r.body] as const)
          .filter(([, text]) => Boolean(text)) as [string, string][],
      );
      // Only the real template. A document that does not match Caravann's own
      // furniture is not worth putting in the bid folder under its name.
      if (template) {
        const { buffer } = await fillTemplate(template, {
          title: rfp.title,
          solicitationNumber: rfp.solicitation_number ?? "",
          dueDate: rfp.due_at ?? "",
          agencyName: rfp.client_agency,
          sections: body,
        });
        const docUrl = await fileProposal(folderId, `${proposalFileName(rfp)}.docx`, buffer);
        if (docUrl) await supabase.from("rfps").update({ proposal_doc_url: docUrl }).eq("id", rfpId);
      }
    } catch {
      /* the draft stands either way */
    }
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

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { error: "OPENROUTER_API_KEY is not set, so nothing can be tailored." };

  const [{ data: section }, { data: rfp }] = await Promise.all([
    supabase.from("rfp_proposal_sections").select("*").eq("id", sectionId).maybeSingle(),
    supabase.from("rfps").select("title,client_agency,solicitation_number,verdict_why").eq("id", rfpId).maybeSingle(),
  ]);
  if (!section?.body || !rfp) return { error: "Nothing to tailor in that section." };

  // What the solicitation itself says, which the tailored text is allowed to
  // draw on without it counting as invention.
  const solicitation = [rfp.title, rfp.client_agency, rfp.solicitation_number, rfp.verdict_why]
    .filter(Boolean)
    .join(". ");

  let reply: string;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
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
            }),
          },
          { role: "user", content: `SECTION: ${section.heading}\n\n${section.body}` },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) return { error: `OpenRouter refused the request (${res.status}).` };
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
