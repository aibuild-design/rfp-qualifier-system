import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge } from "@/components/VerdictBadge";
import { StatCard } from "@/components/StatCard";
import { ScoreMeter } from "@/components/ScoreMeter";
import { FolderBar } from "@/components/FolderBar";
import { MoveToFolder } from "@/components/MoveToFolder";
import { ProfileIncompleteBanner, ProvisionalTag } from "@/components/ProfileIncompleteBanner";
import { DemoBanner, DemoTag } from "@/components/DemoBanner";
import { ChartIcon, CheckCircleIcon, ClockIcon, DocumentIcon } from "@/components/icons";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatBudget, formatDate, isoDaysFromNow } from "@/lib/rfp";

// The RFP queue - this *is* the dashboard per the SOW ("a simple dashboard
// showing the RFP queue by stage"). Ranked by score by default so the
// highest-overlap opportunities sit at top; no-go RFPs drop out of the
// ranked view into their own tab instead of cluttering it. Every row here
// is written by n8n via /api/rfps/intake - nothing on this page writes.
export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const params = await searchParams;
  // One filter param, extending the `view=no-go` the page already had rather
  // than adding a second convention beside it. The stat cards above the queue
  // set it, so a number is also the way into the rows behind it.
  const view = typeof params.view === "string" ? params.view : null;
  const folder = typeof params.folder === "string" ? params.folder : null;
  const showNoGo = view === "no-go";
  const sortByDeadline = params.sort === "deadline";

  const VIEW_TITLES: Record<string, { title: string; blurb: string }> = {
    "no-go": { title: "No-go folder", blurb: "Ruled out, kept - nothing here is deleted." },
    go: { title: "Qualified", blurb: "Cleared every mandatory requirement and scored above the go mark." },
    pending: { title: "Awaiting a verdict", blurb: "Triage has not returned yet." },
    due: { title: "Due soon", blurb: "Open compliance items inside the warning window." },
  };
  const heading = (view && VIEW_TITLES[view]) || {
    title: "RFP queue",
    blurb: "Ranked by qualification score - highest overlap with Caravann first.",
  };

  const supabase = await createClient();

  // Read first and alone: the "due soon" count below is defined by the window,
  // so it cannot be fetched in the same batch as the thing that defines it.
  // One indexed single-row lookup.
  const { data: scoring } = await supabase
    .from("scoring_settings")
    .select("deadline_warning_days,deadline_critical_days,go_threshold")
    .eq("id", true)
    .maybeSingle();
  const windows = deadlineWindowsFrom(scoring);

  const baseQuery = folder
    ? supabase.from("rfps").select("*").eq("folder_id", folder)
    : supabase.from("rfps").select("*");
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
    { data: orgProfile },
    { data: folders },
    { data: allFolderIds },
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
    supabase.from("org_profile").select("profile_confirmed").eq("id", true).maybeSingle(),
    supabase.from("rfp_folders").select("*").order("sort_order").order("name"),
    supabase.from("rfps").select("folder_id"),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("is_demo", true),
  ]);

  const rows = rfps ?? [];

  // One pass over the id list rather than a count query per folder, which would
  // be one round trip per chip on the busiest page in the app.
  const folderCounts: Record<string, number> = {};
  for (const r of allFolderIds ?? []) {
    if (r.folder_id) folderCounts[r.folder_id] = (folderCounts[r.folder_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <DemoBanner count={demoCount ?? 0} />
      {!sectorCount ? (
        <ProfileIncompleteBanner reason="no-sectors" />
      ) : orgProfile?.profile_confirmed !== true ? (
        <ProfileIncompleteBanner reason="unconfirmed" />
      ) : null}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-rfp-ink">{heading.title}</h1>
          <p className="mt-1 text-sm text-rfp-ink-secondary">{heading.blurb}</p>
        </div>
        {/* View controls only. Adding a solicitation lives in the rail on
            desktop and the top bar on mobile - one of which is always on
            screen - so repeating it here only ever duplicated whichever was
            already visible. */}
        <div className="flex w-full flex-wrap items-center gap-2 text-xs font-medium sm:w-auto">
          <a
            href={`/api/rfps/export${demoCount ? "?include_demo=1" : ""}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rfp-border px-3 text-rfp-ink-secondary press hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
            title="Opens in Google Sheets or Excel"
          >
            Export CSV
          </a>
          {/* The read-only mirror. It lives here rather than in Settings because
              the person who wants it is looking at the queue and wants to send
              someone a view of it, which is exactly this row. */}
          {process.env.QUEUE_SHEET_URL && (
            <a
              href={process.env.QUEUE_SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rfp-border px-3 text-rfp-ink-secondary press hover:bg-rfp-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold"
              title="A read-only view of this queue, safe to share"
            >
              Open in Sheets
            </a>
          )}
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

      {/* Folders sit between the verdict cards and the list: the cards say what
          kind of work it is, the folders say which pile it belongs to, and both
          narrow the same queue underneath. */}
      <FolderBar
        folders={folders ?? []}
        counts={folderCounts}
        active={folder}
        unfiled={(allFolderIds ?? []).filter((r) => !r.folder_id).length}
      />

      {/* Each card filters the queue below it. `rise-stagger` brings them in
          left to right, which reads as the numbers being counted up rather than
          the page popping into place. */}
      <div className="rise-stagger mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
          /* An empty queue is the first thing anyone sees on a fresh desk, and
             for a while it is the ONLY thing they see, so it should look like a
             starting line rather than a failure. The three markers show what
             will happen to the first solicitation that arrives - they carry the
             same numbering and the same drawn connector as the overview, so the
             two pages describe one pipeline rather than two. */
          <div className="rise px-6 py-12 text-center sm:py-16">
            <p className="font-display text-base font-semibold text-rfp-ink">
              {showNoGo ? "Nothing ruled out yet" : "The queue is empty"}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-rfp-ink-secondary">
              {showNoGo
                ? "Once triage rules a solicitation out it lands here with its reasoning. Nothing is ever deleted."
                : "Solicitations arrive by email on their own, or you can add one yourself."}
            </p>

            {!showNoGo && (
              <>
                <ol className="rise-stagger mx-auto mt-8 flex max-w-lg flex-col gap-3 text-left sm:flex-row sm:gap-2">
                  {[
                    { n: 1, t: "It arrives", d: "By email, or added by hand" },
                    { n: 2, t: "It gets read", d: "The whole document, three times" },
                    { n: 3, t: "It gets a verdict", d: "About a minute later" },
                  ].map((step, i) => (
                    <li
                      key={step.n}
                      style={{ "--i": i } as CSSProperties}
                      className="flex flex-1 items-start gap-2.5 rounded-lg border border-dashed border-rfp-border px-3 py-2.5 sm:flex-col sm:gap-1.5"
                    >
                      <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rfp-surface-sunken text-[10px] font-semibold text-rfp-ink-muted">
                        {step.n}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-rfp-ink">{step.t}</span>
                        <span className="block text-[11px] leading-relaxed text-rfp-ink-muted">{step.d}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <Link
                  href="/dashboard/new"
                  className="press lift mt-8 inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-5 text-sm font-semibold text-rfp-surface hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold focus-visible:ring-offset-2"
                >
                  Add the first one
                </Link>
              </>
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
                          {!rfp.is_demo && rfp.is_provisional && <ProvisionalTag />}
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
                            {rfp.score_percent !== null ? `${Math.round(rfp.score_percent)}%` : "-"}
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
                    <div className="border-t border-rfp-border px-4 py-2">
                      <MoveToFolder rfpId={rfp.id} folders={folders ?? []} current={rfp.folder_id} />
                    </div>
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
                  <th scope="col" className="hidden px-5 py-3 lg:table-cell">Folder</th>
                  <th scope="col" className="hidden px-5 py-3 sm:table-cell">Arrived</th>
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
                          {!rfp.is_demo && rfp.is_provisional && <ProvisionalTag />}
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
                      <td className="px-5 py-3.5">
                        <ScoreMeter
                          score={rfp.score_percent}
                          status={rfp.status}
                          goThreshold={scoring?.go_threshold ?? 85}
                        />
                      </td>
                      <td className="tabular px-5 py-3.5 text-rfp-ink-secondary">{formatBudget(rfp)}</td>
                      <td className="hidden px-5 py-3.5 lg:table-cell">
                        <MoveToFolder rfpId={rfp.id} folders={folders ?? []} current={rfp.folder_id} />
                      </td>
                      <td className="hidden px-5 py-3.5 text-rfp-ink-muted sm:table-cell">
                        {formatDate(rfp.received_at ?? rfp.created_at)}
                      </td>
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
