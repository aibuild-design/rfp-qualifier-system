import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge } from "@/components/VerdictBadge";
import { StatCard } from "@/components/StatCard";
import { ProfileIncompleteBanner } from "@/components/ProfileIncompleteBanner";
import { DemoBanner, DemoTag } from "@/components/DemoBanner";
import { ChartIcon, CheckCircleIcon, ClockIcon, DocumentIcon } from "@/components/icons";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatBudget, formatDate, isoDaysFromNow } from "@/lib/rfp";

// The RFP queue — this *is* the dashboard per the SOW ("a simple dashboard
// showing the RFP queue by stage"). Ranked by score by default so the
// highest-overlap opportunities sit at top; no-go RFPs drop out of the
// ranked view into their own tab instead of cluttering it. Every row here
// is written by n8n via /api/rfps/intake — nothing on this page writes.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  // One filter param, extending the `view=no-go` the page already had rather
  // than adding a second convention beside it. The stat cards above the queue
  // set it, so a number is also the way into the rows behind it.
  const view = typeof params.view === "string" ? params.view : null;
  const showNoGo = view === "no-go";
  const sortByDeadline = params.sort === "deadline";

  const VIEW_TITLES: Record<string, { title: string; blurb: string }> = {
    "no-go": { title: "No-go folder", blurb: "Ruled out, kept — nothing here is deleted." },
    go: { title: "Qualified", blurb: "Cleared every mandatory requirement and scored above the go mark." },
    pending: { title: "Awaiting a verdict", blurb: "Triage has not returned yet." },
    due: { title: "Due soon", blurb: "Open compliance items inside the warning window." },
  };
  const heading = (view && VIEW_TITLES[view]) || {
    title: "RFP queue",
    blurb: "Ranked by qualification score — highest overlap with Caravann first.",
  };

  const supabase = await createClient();

  // Read first and alone: the "due soon" count below is defined by the window,
  // so it cannot be fetched in the same batch as the thing that defines it.
  // One indexed single-row lookup.
  const { data: scoring } = await supabase
    .from("scoring_settings")
    .select("deadline_warning_days,deadline_critical_days")
    .eq("id", true)
    .maybeSingle();
  const windows = deadlineWindowsFrom(scoring);

  const baseQuery = supabase.from("rfps").select("*");
  const listQuery =
    view === "no-go"
      ? baseQuery.eq("status", "no_go")
      : view === "go"
        ? baseQuery.eq("status", "go")
        : view === "pending"
          ? baseQuery.eq("status", "pending")
          : baseQuery.neq("status", "no_go");

  // None of these depend on each other, so they go out together. Run in
  // sequence this page paid six round trips to Supabase before rendering a
  // single row; the counts are `head: true`, so they return a number and no
  // rows.
  const [
    { data: rfps },
    { count: totalCount },
    { count: goCount },
    { count: pendingCount },
    { count: dueThisWeekCount },
    { count: sectorCount },
    { count: demoCount },
  ] = await Promise.all([
    sortByDeadline
      ? listQuery.order("due_at", { ascending: true, nullsFirst: false })
      : listQuery.order("score_percent", { ascending: false, nullsFirst: false }),
    supabase.from("rfps").select("*", { count: "exact", head: true }),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("status", "go"),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("rfp_compliance_items")
      .select("*", { count: "exact", head: true })
      .eq("is_complete", false)
      .not("due_at", "is", null)
      .lte("due_at", isoDaysFromNow(windows.warningDays)),
    supabase.from("sector_experience").select("*", { count: "exact", head: true }),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("is_demo", true),
  ]);

  const rows = rfps ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <DemoBanner count={demoCount ?? 0} />
      {!sectorCount && <ProfileIncompleteBanner />}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-rfp-ink">{heading.title}</h1>
          <p className="mt-1 text-sm text-rfp-ink-secondary">{heading.blurb}</p>
        </div>
        {/* Every target clears 44px so these are tappable on a phone. The
            primary action comes first on mobile (where it's the reason you
            opened the page) and last on desktop (where the eye ends up). */}
        <div className="flex w-full flex-wrap items-center gap-2 text-xs font-medium sm:w-auto">
          <Link
            href="/dashboard/new"
            className="order-first inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-rfp-black px-4 font-semibold text-white press hover:bg-rfp-black-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold focus-visible:ring-offset-2 sm:order-last sm:flex-none"
          >
            Add a solicitation
          </Link>
          <a
            href={`/api/rfps/export${demoCount ? "?include_demo=1" : ""}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rfp-border px-3 text-rfp-ink-secondary press hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
            title="Opens in Google Sheets or Excel"
          >
            Export CSV
          </a>
          <Link
            href={`/dashboard${sortByDeadline ? "" : "?sort=deadline"}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rfp-border px-3 text-rfp-ink-secondary press hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
          >
            {sortByDeadline ? "Sort by score" : "Sort by deadline"}
          </Link>
          <Link
            href={showNoGo ? "/dashboard" : "/dashboard?view=no-go"}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rfp-border px-3 text-rfp-ink-secondary press hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
          >
            {showNoGo ? "Back to queue" : "View no-go folder"}
          </Link>
        </div>
      </div>

      {/* Each card filters the queue below it. `rise-stagger` brings them in
          left to right, which reads as the numbers being counted up rather than
          the page popping into place. */}
      <div className="rise-stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="RFPs received" value={totalCount ?? 0} subtext="All time"
          icon={DocumentIcon} accent="#0a0a0a" href="/dashboard" active={!view}
        />
        <StatCard
          label="Qualified (go)" value={goCount ?? 0} subtext="Cleared the gate"
          icon={CheckCircleIcon} accent="#1b8a5a" href="/dashboard?view=go" active={view === "go"}
        />
        <StatCard
          label="Pending triage" value={pendingCount ?? 0} subtext="Awaiting verdict"
          icon={ClockIcon} accent="#d9962c" href="/dashboard?view=pending" active={view === "pending"}
        />
        <StatCard
          label={`Due within ${windows.warningDays} days`} value={dueThisWeekCount ?? 0}
          subtext="Open compliance items" icon={ChartIcon} accent="#d97a3a"
          href="/dashboard?sort=deadline" active={sortByDeadline}
        />
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
                : "Solicitations arrive by email, or you can add one yourself. Either way it is read in full and comes back with a verdict in about a minute."}
            </p>
            {!showNoGo && (
              <Link
                href="/dashboard/new"
                className="mt-4 inline-block rounded-lg bg-rfp-black px-4 py-2 text-sm font-semibold text-white press hover:bg-rfp-black-2"
              >
                Add a solicitation
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* A five-column table cannot reflow, so on a phone it either
                overflows the viewport or squeezes the title to nothing. Below
                `md` each row becomes a card with the same information; from
                `md` up the table returns, where it reads better. One source of
                data, two presentations. */}
            <ul className="rise-stagger divide-y divide-rfp-border md:hidden">
              {rows.map((rfp, i) => {
                const days = daysUntil(rfp.due_at);
                return (
                  <li key={rfp.id} style={{ "--i": i } as CSSProperties}>
                    <Link
                      href={`/dashboard/rfps/${rfp.id}`}
                      className="block p-4 press press-card hover:bg-rfp-surface-sunken/60 focus-visible:bg-rfp-surface-sunken focus-visible:outline-none"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-rfp-ink">
                          {rfp.title}
                          {rfp.is_demo && <DemoTag />}
                        </p>
                        <VerdictBadge status={rfp.status} />
                      </div>
                      <p className="mt-1 text-xs text-rfp-ink-muted">
                        {rfp.client_agency}
                        {rfp.project_type ? ` · ${rfp.project_type}` : ""}
                      </p>
                      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <div className="flex items-center gap-1">
                          <dt className="text-rfp-ink-muted">Score</dt>
                          <dd className="tabular font-semibold text-rfp-ink">
                            {rfp.score_percent !== null ? `${Math.round(rfp.score_percent)}%` : "—"}
                          </dd>
                        </div>
                        <div className="flex items-center gap-1">
                          <dt className="text-rfp-ink-muted">Budget</dt>
                          <dd className="tabular text-rfp-ink-secondary">{formatBudget(rfp)}</dd>
                        </div>
                        <div className="flex items-center gap-1">
                          <dt className="text-rfp-ink-muted">Due</dt>
                          <dd className="font-medium" style={{ color: deadlineColor(days, windows) }}>
                            {formatDate(rfp.due_at)}
                            {days !== null && ` (${days < 0 ? "past due" : `${days}d`})`}
                          </dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <table className="hidden w-full text-left text-sm md:table">
              <thead>
                <tr className="border-b border-rfp-border text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
                  <th scope="col" className="px-5 py-3">RFP</th>
                  <th scope="col" className="px-5 py-3">Verdict</th>
                  <th scope="col" className="px-5 py-3">Score</th>
                  <th scope="col" className="px-5 py-3">Budget</th>
                  <th scope="col" className="px-5 py-3">Due</th>
                </tr>
              </thead>
              <tbody className="rise-stagger">
                {rows.map((rfp, i) => {
                  const days = daysUntil(rfp.due_at);
                  return (
                    <tr
                      key={rfp.id}
                      style={{ "--i": i } as CSSProperties}
                      className="press press-row border-b border-rfp-border last:border-0 hover:bg-rfp-surface-sunken/60"
                    >
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/rfps/${rfp.id}`} className="block">
                          <p className="font-medium text-rfp-ink">
                            {rfp.title}
                            {rfp.is_demo && <DemoTag />}
                          </p>
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
                      <td className="px-5 py-3.5" style={{ color: deadlineColor(days, windows) }}>
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
          </>
        )}
      </div>
    </div>
  );
}
