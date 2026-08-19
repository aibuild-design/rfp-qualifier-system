import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { BidSignals } from "@/lib/preferences";

/**
 * Assemble what Khaled did to each bid, from tables that already exist.
 *
 * Worth saying plainly: no tracking was added for this. Whether a proposal was
 * drafted, whether anyone was confirmed, which questions were approved and
 * which compliance items were ticked are all already recorded, because each of
 * them is a thing the product had to store anyway. The behavioural signal was
 * sitting in the schema the whole time; nothing here observes him, it reads
 * work he did.
 *
 * Counted with grouped queries rather than one per bid, because this runs on
 * page load and on every triage, and a per-bid query would be a hundred round
 * trips to answer a question about a hundred bids.
 */
export async function loadBidSignals(
  supabase: SupabaseClient<Database>,
  limit = 200,
): Promise<BidSignals[]> {
  const { data: rfps } = await supabase
    .from("rfps")
    .select("id, title, status, human_verdict, due_at, budget_amount, client_agency, project_type")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rfps || rfps.length === 0) return [];
  const ids = rfps.map((r) => r.id);

  const [sections, assignments, questions, compliance] = await Promise.all([
    supabase.from("rfp_proposal_sections").select("rfp_id").in("rfp_id", ids),
    supabase.from("rfp_team_assignments").select("rfp_id, status").in("rfp_id", ids),
    supabase.from("rfp_questions").select("rfp_id, status").in("rfp_id", ids),
    supabase.from("rfp_compliance_items").select("rfp_id, is_complete").in("rfp_id", ids),
  ]);

  const count = <T extends { rfp_id: string }>(rows: T[] | null, keep: (row: T) => boolean) => {
    const m = new Map<string, number>();
    for (const row of rows ?? []) {
      if (!keep(row)) continue;
      m.set(row.rfp_id, (m.get(row.rfp_id) ?? 0) + 1);
    }
    return m;
  };

  const drafted = count(sections.data, () => true);
  const confirmed = count(assignments.data, (a) => a.status === "confirmed");
  const approved = count(questions.data, (q) => q.status === "approved" || q.status === "sent");
  const declined = count(questions.data, (q) => q.status === "declined");
  const ticked = count(compliance.data, (c) => c.is_complete === true);

  return rfps.map((r) => ({
    id: r.id,
    title: r.title,
    computed: r.status as BidSignals["computed"],
    humanVerdict: r.human_verdict as BidSignals["humanVerdict"],
    drafted: (drafted.get(r.id) ?? 0) > 0,
    teamConfirmed: confirmed.get(r.id) ?? 0,
    questionsApproved: approved.get(r.id) ?? 0,
    questionsDeclined: declined.get(r.id) ?? 0,
    complianceTicked: ticked.get(r.id) ?? 0,
    dueAt: r.due_at,
    sector: r.project_type,
    budget: r.budget_amount,
    agency: r.client_agency,
  }));
}
