import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge } from "@/components/VerdictBadge";
import { StatCard } from "@/components/StatCard";
import { ChartIcon, CheckCircleIcon, ClockIcon, DocumentIcon } from "@/components/icons";
import { daysUntil, deadlineColor, formatBudget, formatDate, isoDaysFromNow } from "@/lib/rfp";

// The RFP queue — this *is* the dashboard per the SOW ("a simple dashboard
// showing the RFP queue by stage"). Ranked by score by default so the
// highest-overlap opportunities sit at top; no-go RFPs drop out of the
// ranked view into their own tab instead of cluttering it. Every row here
// is written by n8n via /api/rfps/intake — nothing on this page writes.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  const showNoGo = params.view === "no-go";
  const sortByDeadline = params.sort === "deadline";

  const supabase = await createClient();

  const baseQuery = supabase.from("rfps").select("*");
  const query = showNoGo ? baseQuery.eq("status", "no_go") : baseQuery.neq("status", "no_go");

  const { data: rfps } = sortByDeadline
    ? await query.order("due_at", { ascending: true, nullsFirst: false })
    : await query.order("score_percent", { ascending: false, nullsFirst: false });

  const { count: totalCount } = await supabase.from("rfps").select("*", { count: "exact", head: true });
  const { count: goCount } = await supabase
    .from("rfps")
    .select("*", { count: "exact", head: true })
    .eq("status", "go");
  const { count: pendingCount } = await supabase
    .from("rfps")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  const { count: dueThisWeekCount } = await supabase
    .from("rfp_compliance_items")
    .select("*", { count: "exact", head: true })
    .eq("is_complete", false)
    .not("due_at", "is", null)
    .lte("due_at", isoDaysFromNow(7));

  const rows = rfps ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-rfp-ink">RFP queue</h1>
          <p className="mt-1 text-sm text-rfp-ink-secondary">
            Ranked by qualification score — highest overlap with Caravann first.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium">
          <Link
            href={`/dashboard${sortByDeadline ? "" : "?sort=deadline"}`}
            className="rounded-lg border border-rfp-border px-3 py-1.5 text-rfp-ink-secondary transition-colors hover:bg-rfp-surface-sunken"
          >
            {sortByDeadline ? "Sort by score" : "Sort by deadline"}
          </Link>
          <Link
            href={showNoGo ? "/dashboard" : "/dashboard?view=no-go"}
            className="rounded-lg border border-rfp-border px-3 py-1.5 text-rfp-ink-secondary transition-colors hover:bg-rfp-surface-sunken"
          >
            {showNoGo ? "Back to queue" : "View no-go folder"}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="RFPs received" value={totalCount ?? 0} subtext="All time" icon={DocumentIcon} accent="#0a0a0a" />
        <StatCard label="Qualified (go)" value={goCount ?? 0} subtext="Cleared the gate" icon={CheckCircleIcon} accent="#1b8a5a" />
        <StatCard label="Pending triage" value={pendingCount ?? 0} subtext="Awaiting verdict" icon={ClockIcon} accent="#d9962c" />
        <StatCard label="Due within 7 days" value={dueThisWeekCount ?? 0} subtext="Open compliance items" icon={ChartIcon} accent="#d97a3a" />
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-rfp-ink">
              {showNoGo ? "No RFPs filed as no-go yet" : "No RFPs yet"}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-rfp-ink-secondary">
              {showNoGo
                ? "Once triage rules an RFP out, it lands here with its reasoning — nothing gets deleted."
                : "Waiting on the first intake from n8n. Once a solicitation is parsed and triaged, it shows up here ranked by score."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rfp-border text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
                <th className="px-5 py-3">RFP</th>
                <th className="px-5 py-3">Verdict</th>
                <th className="px-5 py-3">Score</th>
                <th className="px-5 py-3">Budget</th>
                <th className="px-5 py-3">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rfp) => {
                const days = daysUntil(rfp.due_at);
                return (
                  <tr key={rfp.id} className="border-b border-rfp-border last:border-0 hover:bg-rfp-surface-sunken/60">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/rfps/${rfp.id}`} className="block">
                        <p className="font-medium text-rfp-ink">{rfp.title}</p>
                        <p className="text-xs text-rfp-ink-muted">
                          {rfp.client_agency}
                          {rfp.project_type ? ` · ${rfp.project_type}` : ""}
                        </p>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5">
                      <VerdictBadge status={rfp.status} />
                    </td>
                    <td className="tabular px-5 py-3.5 text-rfp-ink-secondary">
                      {rfp.score_percent !== null ? `${Math.round(rfp.score_percent)}%` : "—"}
                    </td>
                    <td className="tabular px-5 py-3.5 text-rfp-ink-secondary">{formatBudget(rfp)}</td>
                    <td className="px-5 py-3.5" style={{ color: deadlineColor(days) }}>
                      {formatDate(rfp.due_at)}
                      {days !== null && (
                        <span className="ml-1 text-xs opacity-80">
                          ({days < 0 ? "past due" : `${days}d`})
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
