import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// The landing point for n8n's intake → triage pipeline (modules 1-2 of the
// SOW). n8n parses a solicitation, runs it through OpenRouter, and POSTs the
// result here. Idempotent on `external_id` — a re-run for the same
// solicitation (e.g. an addendum re-triage) upserts the rfp row and fully
// replaces its child records rather than appending duplicates.
//
// Auth: a shared secret in the RFP_INTAKE_API_KEY env var, sent as
// `Authorization: Bearer <key>` — deliberately not the Supabase service-role
// key itself, so n8n never holds a credential broader than "post RFP data."
//
// Expected body shape — see supabase/migrations/20260806010000_rfp_domain_schema.sql
// for column meaning:
// {
//   "external_id": "string, required — n8n's dedupe key",
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

type IntakeBody = Partial<Database["public"]["Tables"]["rfps"]["Insert"]> & {
  external_id: string;
  title: string;
  client_agency: string;
  gap_items?: Array<Omit<Database["public"]["Tables"]["rfp_gap_items"]["Insert"], "rfp_id">>;
  compliance_items?: Array<Omit<Database["public"]["Tables"]["rfp_compliance_items"]["Insert"], "rfp_id">>;
  disqualifier_checks?: Array<Omit<Database["public"]["Tables"]["rfp_disqualifier_checks"]["Insert"], "rfp_id">>;
  questions?: Array<Omit<Database["public"]["Tables"]["rfp_questions"]["Insert"], "rfp_id">>;
};

function isAuthorized(req: NextRequest): boolean {
  const key = process.env.RFP_INTAKE_API_KEY;
  if (!key) return false; // fail closed if the secret was never configured
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${key}`;
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

  const { gap_items, compliance_items, disqualifier_checks, questions, ...rfpFields } = body;
  const supabase = createServiceRoleClient();

  const { data: rfp, error: rfpError } = await supabase
    .from("rfps")
    .upsert(rfpFields, { onConflict: "external_id" })
    .select()
    .single();

  if (rfpError || !rfp) {
    return NextResponse.json({ error: rfpError?.message ?? "Failed to upsert RFP" }, { status: 500 });
  }

  const rfpId = rfp.id;

  // Full-replace pattern for child records — simplest way to stay idempotent
  // when n8n re-triages the same solicitation (an addendum lands, a rescore
  // runs). Cheap at this volume; revisit if a table grows large enough for
  // delete+reinsert to matter.
  async function replaceChildren<T extends { rfp_id: string }>(
    table: "rfp_gap_items" | "rfp_compliance_items" | "rfp_disqualifier_checks" | "rfp_questions",
    rows: Omit<T, "rfp_id">[] | undefined
  ) {
    if (rows === undefined) return; // omitted entirely = leave existing rows alone
    await supabase.from(table).delete().eq("rfp_id", rfpId);
    if (rows.length > 0) {
      await supabase.from(table).insert(rows.map((r) => ({ ...r, rfp_id: rfpId })) as never);
    }
  }

  await Promise.all([
    replaceChildren("rfp_gap_items", gap_items),
    replaceChildren("rfp_compliance_items", compliance_items),
    replaceChildren("rfp_disqualifier_checks", disqualifier_checks),
    replaceChildren("rfp_questions", questions),
  ]);

  return NextResponse.json({ id: rfpId, status: "ok" });
}
