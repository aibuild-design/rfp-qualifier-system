import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { toTimestamp } from "@/lib/rfp";
import { decideVerdict, thresholdsFromSettings } from "@/lib/verdict";
import { assembleDraft, DEFAULT_SECTIONS, proposalFileName } from "@/lib/proposal";
import { buildProposalDocx } from "@/lib/docx-export";
import { caravannLogo } from "@/lib/brand-logo";
import { caravannTemplate } from "@/lib/template-store";
import { fillTemplate } from "@/lib/docx-fill";
import { Packer } from "docx";
import { scoreFromRubric, type RubricBreakdown, type RubricWeights } from "@/lib/rubric";
import type { Database, TableInsert } from "@/lib/supabase/types";

// The landing point for n8n's intake → triage pipeline (modules 1-2 of the
// SOW). n8n parses a solicitation, runs it through OpenRouter, and POSTs the
// result here. Idempotent on `external_id` - a re-run for the same
// solicitation (e.g. an addendum re-triage) upserts the rfp row and fully
// replaces its child records rather than appending duplicates.
//
// Auth: a shared secret in the RFP_INTAKE_API_KEY env var, sent as
// `Authorization: Bearer <key>` - deliberately not the Supabase service-role
// key itself, so n8n never holds a credential broader than "post RFP data."
//
// Expected body shape - see supabase/migrations/20260806010000_rfp_domain_schema.sql
// for column meaning:
// {
//   "external_id": "string, required - n8n's dedupe key",
//   "solicitation_number": "string|null - the agency's own number, for the cover",
//   "title": "string, required",
//   "client_agency": "string, required",
//   "project_type": "string?",
//   "source": "aggregator | email | manual | portal",
//   "source_url": "string?",
//   "drive_folder_url": "string?",
//   "received_at": "ISO timestamp?",
//   "due_at": "ISO timestamp?",
//   "question_deadline_at": "ISO timestamp?",
//   "budget_amount": "number?",
//   "budget_source": "rfp | qa_document | none_listed",
//   "status": "pending | go | no_go | maybe",
//   "score_percent": "number 0-100?",
//   "verdict_why": "string?",
//   "verdict_why_not": "string?",
//   "gap_items": [{ "gap_type": "...", "description": "..." }],
//   "compliance_items": [{ "category": "...", "label": "...", "detail": "?", "due_at": "?", "is_complete": "?" }],
//   "disqualifier_checks": [{ "requirement_text": "...", "is_required": "?", "result": "pass|fail|not_applicable", "is_hard_knockout": "?", "notes": "?" }],
//   "questions": [{ "lane": "public_memo|incumbent_request", "question_text": "...", "status": "?" }]
// }

/** A child row as the caller sends it - the parent link is set by this route,
 *  never taken from the body. */
type Child<T extends keyof Database["public"]["Tables"]> = Omit<TableInsert<T>, "rfp_id">;

type IntakeBody = Partial<TableInsert<"rfps">> & {
  external_id: string;
  solicitation_number?: string | null;
  /** The issuing agency's own contact block, read off the solicitation. Used on
   *  the proposal cover and nowhere else, so these are deliberately not columns
   *  on `rfps` - storing them would imply the desk tracks them. */
  agency_address?: string | null;
  agency_poc_name?: string | null;
  agency_poc_phone?: string | null;
  agency_poc_email?: string | null;
  title: string;
  client_agency: string;
  gap_items?: Array<Child<"rfp_gap_items">>;
  compliance_items?: Array<Child<"rfp_compliance_items">>;
  disqualifier_checks?: Array<Child<"rfp_disqualifier_checks">>;
  questions?: Array<Child<"rfp_questions">>;
};

// Explicit allowlist rather than spreading the body into the upsert. Spreading
// let a caller set ANY column on the table - `is_demo` (laundering a fake
// solicitation into the real queue, or hiding a real one from it), `id`,
// `created_at`. The service-role client bypasses RLS, so this route's own
// validation is the only thing standing between the request body and the
// table. Anything not named here is dropped.
const RFP_FIELDS = [
  "is_provisional",
  "external_id",
  "solicitation_number",
  "title",
  "client_agency",
  "project_type",
  "source",
  "source_url",
  "drive_folder_url",
  "received_at",
  "due_at",
  "question_deadline_at",
  "budget_amount",
  "budget_source",
  "status",
  "score_percent",
  "score_samples",
  "score_breakdown",
  "verdict_why",
  "verdict_why_not",
  "verdict_set_at",
] as const;

type RfpInsert = TableInsert<"rfps">;

function pickRfpFields(body: IntakeBody): RfpInsert {
  const out: Partial<RfpInsert> = {};
  for (const k of RFP_FIELDS) {
    const value = body[k];
    if (value !== undefined) {
      (out as Record<string, unknown>)[k] = value;
    }
  }
  // title and client_agency are checked by the caller before this runs.
  return out as RfpInsert;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: IntakeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.external_id || !body.title || !body.client_agency) {
    return NextResponse.json(
      { error: "external_id, title, and client_agency are required" },
      { status: 400 }
    );
  }

  if (!isServiceRoleConfigured) {
    return NextResponse.json(
      { error: "Supabase not configured - set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" },
      { status: 503 }
    );
  }

  const { gap_items, disqualifier_checks, questions } = body;
  const supabase = createServiceRoleClient();

  // The label is decided here, not by the model. Whatever `status` arrived is
  // discarded and recomputed from the score and the gate results, so the same
  // solicitation always lands on the same side of the line. See lib/verdict.ts
  // for why. Only applied once triage has actually run - a freshly submitted
  // row with no checks and no score stays `pending`.
  const triaged = (disqualifier_checks?.length ?? 0) > 0 || body.score_percent !== undefined;
  // Never caller-controlled. It is in the field allowlist so the value we
  // compute below reaches the insert, which would otherwise also let a caller
  // post `is_provisional: false` and mark its own verdict trustworthy. Stripped
  // first, set second.
  delete body.is_provisional;

  let decision = null;
  if (triaged) {
    // Thresholds are Khaled's, read fresh per verdict so a change in Settings
    // applies to the next solicitation without a deploy.
    const [{ data: settings }, { data: orgProfile }] = await Promise.all([
      supabase
        .from("scoring_settings")
        .select("go_threshold,maybe_threshold,preferred_misses_are_fatal,max_score_spread,rubric_weights")
        .eq("id", true)
        .maybeSingle(),
      supabase.from("org_profile").select("profile_confirmed").eq("id", true).maybeSingle(),
    ]);

    // Stamped per row, not read at display time. A verdict reached against an
    // unconfirmed profile does not become correct later because someone ticked
    // a box afterwards - only re-triaging it does. Recording the state at the
    // moment of the decision is what keeps that honest, and it defaults to
    // provisional so a missing profile row fails safe.
    body.is_provisional = orgProfile?.profile_confirmed !== true;

    // The score is computed here from the rubric classifications, not taken
    // from the model. Asking for an open-ended 0-100 is what produced the
    // variance; classifying five anchored dimensions and doing the arithmetic
    // ourselves is the same fix already applied to the label.
    //
    // A payload without a rubric still works and keeps whatever score it
    // carried - the old shape has to stay valid, or a half-deployed workflow
    // would silently stop producing verdicts.
    const rubric = scoreFromRubric(
      body.score_breakdown as RubricBreakdown | null,
      (settings?.rubric_weights as RubricWeights | null) ?? undefined
    );
    if (rubric) {
      if (body.score_percent !== undefined && body.score_percent !== null && Math.abs(body.score_percent - rubric.score) > 10) {
        console.info(
          `[intake ${body.external_id}] model volunteered ${body.score_percent}%, rubric computes ${rubric.score}% - using the rubric`
        );
      }
      body.score_percent = rubric.score;
    }
    decision = decideVerdict(
      body.score_percent,
      disqualifier_checks ?? [],
      thresholdsFromSettings(settings),
      body.score_samples ?? null
    );
  }
  if (decision && decision.status !== "pending") {
    if (body.status && body.status !== decision.status) {
      console.info(
        `[intake ${body.external_id}] model said "${body.status}", thresholds say "${decision.status}" - ${decision.reason}`
      );
    }
    body.status = decision.status;
  }

  // The only child field Postgres can reject on content. Normalised here rather
  // than trusted, because an unparseable date used to take the whole compliance
  // checklist down with it - see toTimestamp.
  const compliance_items = body.compliance_items?.map((item) => ({
    ...item,
    due_at: toTimestamp(item.due_at),
  }));

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .upsert(pickRfpFields(body), { onConflict: "external_id" })
    .select()
    .single();

  if (rfpError || !rfp) {
    return NextResponse.json({ error: rfpError?.message ?? "Failed to upsert RFP" }, { status: 500 });
  }

  const rfpId = rfp.id;

  // Full-replace pattern for child records - simplest way to stay idempotent
  // when n8n re-triages the same solicitation (an addendum lands, a rescore
  // runs). Cheap at this volume; revisit if a table grows large enough for
  // delete+reinsert to matter.
  //
  // Every outcome is collected rather than ignored. Swallowing these errors
  // meant a rejected insert returned `200 {"status":"ok"}` with the compliance
  // checklist quietly missing - the worst possible failure on a bid desk,
  // because the RFP looks triaged and the technicalities that disqualify are
  // simply absent.
  const failures: string[] = [];

  async function replaceChildren<T extends { rfp_id: string }>(
    table: "rfp_gap_items" | "rfp_compliance_items" | "rfp_disqualifier_checks" | "rfp_questions",
    rows: Omit<T, "rfp_id">[] | undefined
  ) {
    if (rows === undefined) return; // omitted entirely = leave existing rows alone

    const { error: deleteError } = await supabase.from(table).delete().eq("rfp_id", rfpId);
    if (deleteError) {
      failures.push(`${table}: ${deleteError.message}`);
      return;
    }
    if (rows.length === 0) return;

    const { error: insertError } = await supabase
      .from(table)
      .insert(rows.map((r) => ({ ...r, rfp_id: rfpId })) as never);
    if (insertError) {
      failures.push(`${table} (${rows.length} row(s)): ${insertError.message}`);
    }
  }

  await Promise.all([
    replaceChildren("rfp_gap_items", gap_items),
    replaceChildren("rfp_compliance_items", compliance_items),
    replaceChildren("rfp_disqualifier_checks", disqualifier_checks),
    replaceChildren("rfp_questions", questions),
  ]);

  if (failures.length > 0) {
    // The rfp row itself is already saved and correct, so the id is returned -
    // but this is a 500 so n8n's run is marked failed and the dashboard's
    // submit path records it on the row instead of showing a complete verdict.
    return NextResponse.json(
      { id: rfpId, error: "Some triage detail could not be saved", failed: failures },
      { status: 500 }
    );
  }

  // The draft comes back with the verdict so n8n can file it in the bid folder
  // without a second round trip. Assembled here rather than in n8n because the
  // language library and the section structure are the app's to own - n8n
  // moves documents, it does not decide what is in them.
  //
  // Only for bids worth pursuing. A no-go does not need a proposal, and writing
  // one into the folder would suggest otherwise.
  // Returned as a real Word file, not as text for something downstream to lay
  // out. The formatting is the point: Caravann's three-line navy masthead with
  // the rule beneath, the solicitation number and due date on the same line,
  // Times New Roman, one-inch margins, the footer on every page. An evaluator
  // sees the masthead before a word of the writing, and a proposal whose
  // furniture does not match the firm's other submissions reads as assembled by
  // someone else.
  //
  // Base64 so it survives a JSON response; n8n decodes it straight back to a
  // .docx and files it. Uploaded that way Drive converts it to a Google Doc with
  // the styling intact, which plain text could never do.
  let proposal_docx: string | null = null;
  let proposal_name: string | null = null;
  if (body.status === "go" || body.status === "maybe") {
    const [{ data: blocks }, { data: full }] = await Promise.all([
      supabase.from("language_blocks").select("*"),
      supabase.from("rfps").select("*").eq("id", rfpId).maybeSingle(),
    ]);
    if (full) {
      const sections = assembleDraft(full, blocks ?? [], DEFAULT_SECTIONS).map((s, i) => ({
        id: `s${i}`, rfp_id: rfpId, section_type: s.section_type, heading: s.heading,
        body: s.body, status: s.status, sort_order: s.sort_order,
        source_block_ids: s.source_block_ids, notes: s.notes,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }));
      // Caravann's own file, filled - not a lookalike rebuilt from
      // measurements. Everything the template already gets right stays right:
      // the logo, the contents field, the page size, the spacing. Falls back to
      // building the document from scratch if storage is unreachable, because a
      // worse proposal beats losing the verdict with it.
      const template = await caravannTemplate();
      let buffer: Buffer;
      if (template) {
        const filled = await fillTemplate(template, {
          title: full.title,
          // Never external_id. That is n8n's dedupe key, and for an emailed
          // solicitation it reads "gmail-19ff705ed2230acc" - an internal message
          // id printed where the evaluator expects their own reference. Blank
          // is honest when the document names no number; wrong is not.
          solicitationNumber: full.solicitation_number?.trim() || "",
          dueDate: full.due_at
            ? new Date(full.due_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })
            : "[Insert due date]",
          agencyName: full.client_agency,
          // Straight from the solicitation. Anything the document did not state
          // is left undefined, and the template's own red placeholder stays -
          // a visible gap beats a blank an evaluator reads as an oversight.
          agencyAddress: body.agency_address ?? undefined,
          agencyPocName: body.agency_poc_name ?? undefined,
          agencyPocPhone: body.agency_poc_phone ?? undefined,
          agencyPocEmail: body.agency_poc_email ?? undefined,
          // Keyed by the template's own heading text, so the assembler's
          // section list and the template stay joined by something visible in
          // both rather than by an index nobody would notice drifting.
          sections: Object.fromEntries(
            sections.filter((sec) => sec.body).map((sec) => [sec.heading, sec.body as string])
          ),
        });
        if (filled.unreplaced.length) {
          console.warn(`[intake ${body.external_id}] template placeholders left unfilled: ${filled.unreplaced.join(", ")}`);
        }
        buffer = filled.buffer;
      } else {
        buffer = Buffer.from(await Packer.toBuffer(buildProposalDocx(full, sections as never, (await caravannLogo()) ?? undefined)));
      }
      proposal_docx = buffer.toString("base64");
      proposal_name = `${proposalFileName(full)}.docx`;
    }
  }

  // `verdict` is separate from `status` on purpose. `status` is this endpoint's
  // success flag and always reads "ok" on the happy path; n8n was filing every
  // bid by it, so `"ok"` fell through the go/maybe/no_go ternary and landed on
  // "go" - a no-go would have been filed into a folder labelled [go], which is
  // the one thing the folder name exists to tell you at a glance.
  return NextResponse.json({
    id: rfpId,
    status: "ok",
    verdict: body.status ?? "pending",
    proposal_docx,
    proposal_name,
  });
}
