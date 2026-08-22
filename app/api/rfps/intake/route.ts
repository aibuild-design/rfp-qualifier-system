import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAuthorized } from "@/lib/api-auth";
import { isServiceRoleConfigured } from "@/lib/supabase/config";
import { toTimestamp } from "@/lib/rfp";
import { decideVerdict, thresholdsFromSettings, type Decision } from "@/lib/verdict";
import { recommendTeam } from "@/lib/team-match";
import { costLaneFrom } from "@/lib/cost-lane";
import { stripDashesDeep } from "@/lib/no-dashes";
import { scoreFromRubric, type RubricBreakdown, type RubricWeights } from "@/lib/rubric";
import type { Database, TableInsert } from "@/lib/supabase/types";
import { verdictMessage } from "@/lib/slack";

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
//   "standout": "string? - one line on what makes this one notable",
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
  /** One rubric per triage read, for measuring how far they disagreed. */
  score_rubrics?: RubricBreakdown[] | null;
  /**
   * The solicitation itself, archived against the bid so a proposal written
   * months later is composed by something that has actually read the RFP.
   */
  document_text?: string | null;
  source_mailbox?: string | null;
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
  "source_mailbox",
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
  "standout",
  "verdict_set_at",
  // The issuing agency's own contact block.
  //
  // These were declared on IntakeBody, documented in the header above, given a
  // paragraph of their own in the triage prompt telling the model the job is
  // "not optional", carried through reconciliation, and then dropped here -
  // because the allowlist is what actually decides, and they were never added
  // to it. Every one of the four arrived and none was ever stored. The values
  // sitting on a few older rows were put there by hand.
  //
  // What that cost: they print on the proposal cover under "Prepared For", so
  // every document the desk produced went out with four red placeholders on
  // page one for somebody to notice and fill in.
  "agency_address",
  "agency_poc_name",
  "agency_poc_phone",
  "agency_poc_email",
] as const;

/** The four contact fields, as they should reach the cover page. */
const AGENCY_FIELDS = ["agency_address", "agency_poc_name", "agency_poc_phone", "agency_poc_email"] as const;

/**
 * A sentence explaining that a value is missing is not a value.
 *
 * The prompt asks for null when the document does not state something, and a
 * read of the LA County RFSQ returned the string "Not stated in the
 * solicitation" in the phone field instead. Stored as written it prints under
 * "Prepared For" on a document going to a public buyer, which is worse than the
 * red placeholder it displaced: the placeholder is visibly unfinished, and this
 * looks like a considered answer.
 */
const NOT_STATED =
  /^\s*(?:n\/?a|none|null|unknown|-+|(?:not|none)\s+(?:stated|listed|provided|specified|given|available|found|indicated|named)\b.*|no\s+(?:phone|email|address|contact|number)\b.*|not\s+in\s+the\b.*)\s*\.?\s*$/i;

function cleanAgencyFields(body: IntakeBody): void {
  for (const key of AGENCY_FIELDS) {
    const value = body[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    body[key] = trimmed === "" || NOT_STATED.test(trimmed) ? null : trimmed;
  }
}

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
    // Every string the model wrote, stripped of em and en dashes before it
    // touches the database. The prompt asks for none, and asking is worth
    // doing, but a prompt is a request rather than a guarantee - and this text
    // reaches a verdict card, an email and a Word document, so the rule has to
    // hold at the boundary rather than at each of the three places it is read.
    body = stripDashesDeep(await req.json()) as IntakeBody;
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

  cleanAgencyFields(body);

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

  let decision: Decision | null = null;
  // The thresholds half is whatever thresholdsFromSettings accepts; the rubric
  // weights are read here too, so the select list covers both.
  let settings:
    | (NonNullable<Parameters<typeof thresholdsFromSettings>[0]> & {
        rubric_weights?: RubricWeights | null;
      })
    | null = null;
  if (triaged) {
    // Thresholds are Khaled's, read fresh per verdict so a change in Settings
    // applies to the next solicitation without a deploy.
    const [{ data: settingsRow }, { data: orgProfile }, { data: knockouts }] = await Promise.all([
      supabase
        .from("scoring_settings")
        .select("go_threshold,maybe_threshold,preferred_misses_are_fatal,max_score_spread,rubric_weights")
        .eq("id", true)
        .maybeSingle(),
      supabase.from("org_profile").select("profile_confirmed").eq("id", true).maybeSingle(),
      supabase.from("hard_knockouts").select("term, reason"),
    ]);
    settings = settingsRow;

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

    // Score every read with the same weights, so the spread is a real measure of
    // disagreement rather than of rounding. This used to arrive pre-computed as
    // `score_samples`, built from a `score_percent` the model returned - and it
    // silently became an empty array when scoring moved to the rubric and the
    // model stopped returning one. The spread rule, and the edge case that
    // depends on it, had nothing to read.
    //
    // Recomputed here rather than in n8n because the weights are Khaled's and
    // live in Settings; scoring them anywhere else means the day he changes a
    // weight, the spread starts measuring a different thing from the score.
    if (Array.isArray(body.score_rubrics) && body.score_rubrics.length > 0) {
      const perRead = body.score_rubrics
        .map((r) => scoreFromRubric(r, (settings?.rubric_weights as RubricWeights | null) ?? undefined)?.score)
        .filter((n): n is number => typeof n === "number");
      if (perRead.length > 0) body.score_samples = perRead;
    }
    delete body.score_rubrics;
    decision = decideVerdict(
      body.score_percent,
      disqualifier_checks ?? [],
      thresholdsFromSettings(settings, knockouts ?? []),
      body.score_samples ?? null,
      body.due_at ?? null
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

  // Read out of the compliance items the model already produced rather than
  // asked for separately: the evaluation weighting is in the document once, and
  // two ways of capturing it is two ways to disagree.
  const costLane = costLaneFrom(compliance_items ?? []);

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .upsert(
      {
        ...pickRfpFields(body),
        cost_weight_percent: costLane?.percent ?? null,
        cost_lane: costLane?.lane ?? null,
        cost_lane_note: costLane?.note ?? null,
      },
      { onConflict: "external_id" },
    )
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

  /**
   * Keep the document the verdict was made from.
   *
   * Triage derived requirements, compliance items and a rubric from the
   * solicitation and then dropped it. Nothing held the text: the only copy was
   * a .txt file n8n put in the Drive folder, which nothing reads back.
   *
   * Fine while a bid is drafted the same week, quietly wrong afterwards. Khaled
   * accepts a solicitation months after it lands, and the proposal is then
   * written from a list of extracted requirements by a composer that has never
   * read the RFP. It cannot use the agency's own words, follow the order the
   * questions were asked in, or quote a clause back.
   *
   * Replaced rather than appended, so a re-triage after an addendum leaves one
   * current copy instead of a pile.
   */
  async function archiveSolicitation() {
    const text = typeof body.document_text === "string" ? body.document_text.trim() : "";
    if (!text) return;

    await supabase.from("source_documents").delete().eq("rfp_id", rfpId).eq("kind", "solicitation");
    const { error } = await supabase.from("source_documents").insert({
      rfp_id: rfpId,
      kind: "solicitation",
      name: `${body.solicitation_number ?? body.title ?? "Solicitation"}.txt`,
      body: text,
      characters: text.length,
    });
    if (error) failures.push(`source_documents: ${error.message}`);
  }

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
    archiveSolicitation(),
    replaceChildren("rfp_questions", questions),
    recordEdgeCases(),
    recordConnectionHealth(),
    recommendTeamFor(),
  ]);

  /**
   * Module 9, on arrival rather than on a button.
   *
   * The matcher was only ever run by clicking "Suggest team", so a solicitation
   * sat in the queue with an empty team panel until someone thought to press it
   * - on the one screen where the question "who would even do this work" is
   * part of deciding whether to bid at all.
   *
   * Safe to do automatically because suggesting is not assigning. Every row is
   * written `recommended`, which is inert; confirming one stays a person's
   * click. And the matcher is deterministic - token overlap against the stated
   * requirements, no model call - so this costs nothing and cannot drift
   * between runs the way a generated answer would.
   *
   * Confirmed assignments are never touched. Re-triage replaces suggestions
   * only, so an addendum arriving cannot quietly undo a decision.
   */
  async function recommendTeamFor() {
    if (!triaged || !disqualifier_checks?.length) return;

    const [{ data: members }, { data: existing }] = await Promise.all([
      supabase.from("team_members").select("*"),
      supabase.from("rfp_team_assignments").select("team_member_id,status").eq("rfp_id", rfpId),
    ]);

    // The gate rows here are inserts, where is_required is optional; the matcher
    // wants it decided. Absent means "not marked mandatory", which is false.
    const checks = disqualifier_checks.map((c) => ({
      requirement_text: c.requirement_text ?? "",
      is_required: c.is_required === true,
    }));
    const picks = recommendTeam(members ?? [], checks);
    if (!picks.length) return;

    const { error: deleteError } = await supabase
      .from("rfp_team_assignments")
      .delete()
      .eq("rfp_id", rfpId)
      .eq("status", "recommended");
    if (deleteError) {
      failures.push(`rfp_team_assignments: ${deleteError.message}`);
      return;
    }

    // Someone already confirmed for this bid keeps their place rather than
    // reappearing as a suggestion underneath their own confirmation.
    const confirmed = new Set((existing ?? []).filter((e) => e.status !== "recommended").map((e) => e.team_member_id));
    const rows = picks
      .filter((p) => !confirmed.has(p.team_member_id))
      .map((p) => ({
        rfp_id: rfpId,
        team_member_id: p.team_member_id,
        status: "recommended" as const,
        match_reason: p.match_reason,
        match_score: p.match_score,
      }));
    if (rows.length === 0) return;

    const { error } = await supabase.from("rfp_team_assignments").insert(rows);
    if (error) failures.push(`rfp_team_assignments (${rows.length} row(s)): ${error.message}`);
  }

  /**
   * Stamp what just demonstrably worked.
   *
   * The Connections panel used to read this off the queue, which tied the health
   * of a Google credential to whether any solicitations happened to be sitting
   * in the database. Clearing the queue - an ordinary thing to do before a demo
   * - turned three working connections into three amber "Unproven" lines.
   *
   * Health and workload are different facts. This records the first at the
   * moment it is proven, so deleting the second cannot unprove it.
   *
   * Written per kind rather than appended: the only question being asked is
   * "when did this last work", and a growing history would be noise. Failures
   * are swallowed - a health stamp that cannot be written must never be the
   * reason a verdict fails to save.
   */
  async function recordConnectionHealth() {
    const now = new Date().toISOString();
    const rows: Array<{ kind: string; last_ok_at: string; detail: string | null }> = [];

    if (body.source === "email") {
      rows.push({ kind: "gmail", last_ok_at: now, detail: body.source_mailbox ?? null });
    }
    // A verdict coming back is the proof that n8n reached OpenRouter and
    // returned something the desk could score.
    if (triaged) {
      rows.push({ kind: "triage", last_ok_at: now, detail: null });
    }
    if (rows.length === 0) return;

    const { error } = await supabase.from("connection_events").upsert(rows, { onConflict: "kind" });
    if (error) console.warn(`[intake ${body.external_id}] could not stamp connection health: ${error.message}`);
  }

  /**
   * Module 11's producer.
   *
   * The weekly review page reads `rfp_edge_cases` and nothing ever wrote to it,
   * so the module was a consumer with no producer: it rendered, it could clear
   * items, and it had none to clear. Every signal it needs was already being
   * computed here and then discarded.
   *
   * An edge case is not "the desk got it wrong" - nobody knows that yet. It is
   * "the desk was not sure", which is a different and knowable thing, and the
   * three ways that happens are all visible at decision time:
   *
   *   · the reads disagreed enough that the spread rule fired
   *   · a mandatory requirement came back `unclear` - the document was silent,
   *     which is the case the gate deliberately refuses to treat as a failure
   *   · the score landed within two points of a threshold, where a different
   *     run of the same document would have produced a different label
   *
   * No rule change is proposed. The SOW's standard is that the desk never
   * retunes itself, so this records what to look at and leaves the judgement to
   * the weekly pass.
   */
  async function recordEdgeCases() {
    if (!decision || decision.status === "pending") return;

    // Each raised case carries the change that would stop it recurring. The
    // SOW asked for proposed rule changes and the column has been displayed
    // since the review page was built, but nothing ever wrote to it, so every
    // case said "here is a problem" and none said what to do about it.
    //
    // Drafted in code rather than asked of the model, for the same reason the
    // verdict is: a rule change names a specific setting and a specific value,
    // and it has to be the same proposal every time the same situation occurs.
    // A model asked to suggest one writes a plausible sentence instead.
    const reasons: { description: string; proposed_rule_change: string | null }[] = [];

    // The verdict layer already phrases this one, and its wording is the
    // account shown everywhere else - repeating it in different words here
    // would put two descriptions of one event in front of the same reader.
    if (/disagree|spread/i.test(decision.reason)) {
      reasons.push({
        description: decision.reason,
        // Deliberately not "widen the tolerance". Three reads landing far
        // apart on one document usually means the document is ambiguous, not
        // that the limit is wrong, and widening it would convert exactly this
        // signal into silence.
        proposed_rule_change:
          "No setting change proposed. A wide spread means the document itself was read three different ways, and raising the tolerance in Settings would hide that rather than fix it. Worth reading this one yourself.",
      });
    }

    const unclear = (disqualifier_checks ?? []).filter(
      (c) => c.result === "unclear" && (c.is_required === true || c.is_hard_knockout === true)
    );
    if (unclear.length > 0) {
      reasons.push({
        description:
          `${unclear.length} mandatory requirement${unclear.length > 1 ? "s" : ""} could not be confirmed from the document: ` +
          unclear.map((c) => c.requirement_text).join("; "),
        proposed_rule_change: profileFieldFor(unclear.map((c) => c.requirement_text)),
      });
    }

    const score = body.score_percent;
    if (typeof score === "number") {
      const t = thresholdsFromSettings(settings);
      const near = [t.go, t.maybe].find((edge) => Math.abs(score - edge) <= 2);
      if (near !== undefined) {
        reasons.push({
          description: `Scored ${score}%, within two points of the ${near}% line - the same document could land either side of it on another run.`,
          // Conditional on purpose. Whether the line is in the wrong place
          // depends on what Khaled would have done with this bid, and that is
          // not known at the moment the verdict is computed.
          proposed_rule_change:
            score < near
              ? `If you would have bid this, lower the ${near === t.go ? "go" : "maybe"} threshold in Settings to ${score}. If not, the line is where it should be.`
              : `If you would not have bid this, raise the ${near === t.go ? "go" : "maybe"} threshold in Settings above ${score}. If you would, the line is where it should be.`,
        });
      }
    }

    // Idempotent for the same reason the other children are: a re-triage
    // replaces its own rows rather than stacking a second copy. Resolved ones
    // are left alone, because clearing an item is a decision and re-triaging a
    // solicitation should not undo it.
    const { error: deleteError } = await supabase
      .from("rfp_edge_cases")
      .delete()
      .eq("rfp_id", rfpId)
      .eq("status", "pending");
    if (deleteError) {
      failures.push(`rfp_edge_cases: ${deleteError.message}`);
      return;
    }
    if (reasons.length === 0) return;

    const { error: insertError } = await supabase.from("rfp_edge_cases").insert(
      reasons.map((r) => ({ rfp_id: rfpId, ...r, status: "pending" as const }))
    );
    if (insertError) {
      failures.push(`rfp_edge_cases (${reasons.length} row(s)): ${insertError.message}`);
    }
  }

  if (failures.length > 0) {
    // The rfp row itself is already saved and correct, so the id is returned -
    // but this is a 500 so n8n's run is marked failed and the dashboard's
    // submit path records it on the row instead of showing a complete verdict.
    return NextResponse.json(
      { id: rfpId, error: "Some triage detail could not be saved", failed: failures },
      { status: 500 }
    );
  }

  // No proposal is written here any more.
  //
  // It used to be assembled on arrival for every go and maybe, which meant a
  // fourteen-section draft existed under bids Khaled had not looked at, let
  // alone decided on, and the page showed him that draft before it showed him
  // the decision he was there to make. Drafting is now something he asks for,
  // after accepting the bid: `buildDraft` in the bid page's actions does the
  // same assembly on the same library, so nothing was lost by removing it here.
  //
  // The response shape is unchanged. A bid with no draft yet carries nulls, and
  // n8n's filing branch already handles that by filing the solicitation alone -
  // "Proposal as multipart" returns an empty list when proposal_docx is absent,
  // and "Is there a file to file?" routes past the upload.
  const proposal_docx: string | null = null;
  const proposal_name: string | null = null;

  // `verdict` is separate from `status` on purpose. `status` is this endpoint's
  // success flag and always reads "ok" on the happy path; n8n was filing every
  // bid by it, so `"ok"` fell through the go/maybe/no_go ternary and landed on
  // "go" - a no-go would have been filed into a folder labelled [go], which is
  // the one thing the folder name exists to tell you at a glance.
  // Slack, if it is set up. Composed here rather than in n8n because the
  // wording of a decision belongs with the code that made it, and handed over
  // ready to post so there is no second place a verdict could be phrased
  // differently. Null when no webhook is recorded, which n8n treats as "skip".
  // Read here rather than reusing the settings fetch above, which is scoped to
  // the triage branch: a bid can reach this point without having been triaged,
  // and it still deserves a notification.
  const { data: notify } = await supabase
    .from("scoring_settings")
    .select("slack_webhook_url")
    .eq("id", true)
    .maybeSingle();
  const slackUrl = notify?.slack_webhook_url?.trim() || null;
  // Taken from the request rather than from BID_DESK_URL. That variable is set
  // locally and was never set in Vercel, so the deployed API built the link as
  // "/dashboard/rfps/..." with no host, and Slack rendered the raw markup
  // instead of a link. The API always knows its own origin; an environment
  // variable is one more thing to forget.
  const origin = req.nextUrl.origin || (process.env.BID_DESK_URL ?? "").replace(/\/$/, "");
  const deskUrl = `${origin}/dashboard/rfps/${rfpId}`;
  const slack = slackUrl
    ? {
        url: slackUrl,
        message: verdictMessage({
          id: rfpId,
          title: body.title ?? "Untitled solicitation",
          agency: body.client_agency ?? null,
          verdict: (body.status as "go" | "maybe" | "no_go") ?? "pending",
          score: typeof body.score_percent === "number" ? body.score_percent : null,
          budget: typeof body.budget_amount === "number" ? body.budget_amount : null,
          dueAt: body.due_at ?? null,
          questionDeadlineAt: body.question_deadline_at ?? null,
          standout: body.standout ?? null,
          why: body.verdict_why ?? null,
          whyNot: body.verdict_why_not ?? null,
          provisional: body.is_provisional !== false,
          deskUrl,
          documentUrl: body.source_url ?? null,
        }),
      }
    : null;

  return NextResponse.json({
    id: rfpId,
    status: "ok",
    verdict: body.status ?? "pending",
    proposal_docx,
    proposal_name,
    slack,
  });
}

/**
 * Which Settings field would have answered these requirements.
 *
 * A mandatory requirement comes back "unclear" when the eligibility profile is
 * silent, never because Caravann falls short - so the fix is always the same
 * shape: record the missing fact once and every future solicitation asking for
 * it resolves instead of stalling. Naming the actual field is the difference
 * between a note someone acts on and a note someone reads.
 *
 * Matched on the requirement's own words rather than the gate's field names,
 * because the gate does not report which of its inputs it was missing - it only
 * reports that it could not tell.
 */
function profileFieldFor(requirements: string[]): string {
  const text = requirements.join(" ").toLowerCase();
  const fields: [RegExp, string][] = [
    [/insur|liabilit|workers.? comp|indemnif/, "Insurance carried"],
    [/set.?aside|dbe|mbe|wbe|sbe|disadvantaged|minority|small business/, "Set-aside status"],
    [/bilingual|spanish|translat|interpret|multilingual/, "Bilingual staff"],
    [/video|film|photograph|media production|broadcast/, "Media production capable"],
    [/public relations|media relations|press|communications strateg/, "PR capable"],
    // "licen[cs]" catches both spellings, and agencies do write "licence".
    // "certificat" rather than "certif" on purpose: bare "certif" matches
    // "certified DBE", which is a set-aside question, not a credential one.
    [/licen[cs]|certificat|registrat|sam\.gov|cage code|\buei\b/, "Certifications"],
    [/office|local|locat|headquarter|within .{0,20}(county|miles)/, "Office and consultant locations"],
    [/council|commission|board of|elected|appointed|governing body/, "Facilitating elected or appointed bodies"],
  ];
  const named = fields.filter(([re]) => re.test(text)).map(([, name]) => name);

  if (named.length === 0) {
    return "Record whatever would settle this in the eligibility profile in Settings, then re-run. Unclear means the profile is silent on it, not that Caravann falls short.";
  }
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `Fill in ${list} in Settings. The profile is silent on this, so the gate cannot answer it, and it will stall every solicitation that asks until it is recorded.`;
}
