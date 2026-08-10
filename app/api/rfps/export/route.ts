import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";
import { formatDeadline } from "@/lib/rfp";

// The whole queue as a spreadsheet - the SOW's "Google Sheets tracker" without
// needing Google. Opens directly in Sheets or Excel.
//
// Session-scoped, so RLS applies and a non-allowlisted account exports nothing.
export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Demo rows are excluded by default so an export doesn't quietly mix
  // fabricated solicitations into a real tracker. ?include_demo=1 to keep them.
  const includeDemo = req.nextUrl.searchParams.get("include_demo") === "1";

  const base = supabase.from("rfps").select("*").order("score_percent", { ascending: false, nullsFirst: false });
  const { data: rfps } = includeDemo ? await base : await base.eq("is_demo", false);

  const ids = (rfps ?? []).map((r) => r.id);
  const [{ data: gaps }, { data: compliance }] = await Promise.all([
    ids.length
      ? supabase.from("rfp_gap_items").select("rfp_id,gap_type,description").in("rfp_id", ids)
      : Promise.resolve({ data: [] as { rfp_id: string; gap_type: string; description: string }[] }),
    ids.length
      ? supabase.from("rfp_compliance_items").select("rfp_id,is_complete").in("rfp_id", ids)
      : Promise.resolve({ data: [] as { rfp_id: string; is_complete: boolean }[] }),
  ]);

  const gapsFor = (id: string) =>
    (gaps ?? []).filter((g) => g.rfp_id === id).map((g) => `${g.gap_type}: ${g.description}`).join(" | ");

  const complianceFor = (id: string) => {
    const items = (compliance ?? []).filter((c) => c.rfp_id === id);
    if (!items.length) return "";
    return `${items.filter((c) => c.is_complete).length}/${items.length} complete`;
  };

  const headers = [
    "Title",
    "Agency",
    "Project type",
    "Verdict",
    "Score %",
    "Budget",
    "Budget source",
    "Due",
    "Question deadline",
    "Compliance",
    "Gaps",
    "Why",
    "Why not",
    "Source",
    "Received",
    "Demo",
  ];

  const rows = (rfps ?? []).map((r) => [
    r.title,
    r.client_agency,
    r.project_type,
    r.status,
    r.score_percent,
    r.budget_source === "none_listed" ? "not listed in RFP" : r.budget_amount,
    r.budget_source,
    formatDeadline(r.due_at),
    formatDeadline(r.question_deadline_at),
    complianceFor(r.id),
    gapsFor(r.id),
    r.verdict_why,
    r.verdict_why_not,
    r.source,
    formatDeadline(r.received_at),
    r.is_demo ? "yes" : "",
  ]);

  const csv = toCsv(headers, rows);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(
    // BOM so Excel reads it as UTF-8 - without it, the em dashes and accents in
    // agency names and solicitation titles arrive mangled.
    "﻿" + csv,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="caravann-rfp-queue-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    }
  );
}
