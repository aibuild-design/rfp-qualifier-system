import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VerdictBadge } from "@/components/VerdictBadge";
import { QueueFilter } from "@/components/QueueFilter";
import { ScoreMeter } from "@/components/ScoreMeter";
import { FolderBar } from "@/components/FolderBar";
import { MoveToFolder } from "@/components/MoveToFolder";
import { ProfileIncompleteBanner, ProvisionalTag } from "@/components/ProfileIncompleteBanner";
import { DemoBanner, DemoTag } from "@/components/DemoBanner";
import { CreditBanner } from "@/components/CreditBanner";
import { openRouterCredit } from "@/lib/openrouter-credit";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatBudget, formatDate } from "@/lib/rfp";

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
    "no-go": { title: "No-go section", blurb: "Ruled out, kept - nothing here is deleted." },
    go: { title: "Qualified", blurb: "Cleared every mandatory requirement and scored above the go mark." },
    pending: { title: "Awaiting a verdict", blurb: "Triage has not returned yet." },
    due: { title: "Due soon", blurb: "Open compliance items inside the warning window." },
  };
  const heading = (view && VIEW_TITLES[view]) || {
    title: "RFP queue",
    blurb: "Ranked by qualification score - highest overlap with Caravann first.",
  };

  const supabase = await createClient();

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

  // One wave, six queries. This page used to issue twelve across two waves: an
  // indexed lookup for the deadline windows on its own, and then eleven
  // together, of which *seven* were different questions about the same table.
  //
  // Five were `count` queries on rfps, one per status, beside a sixth that
  // selected every folder_id and a seventh that counted demo rows. Each is a
  // separate network round trip to answer something the rows already know, on
  // a page that fetches those rows anyway. One narrow projection over rfps
  // replaces all seven, and the counting happens in a single pass below.
  //
  // The deadline windows joined the batch too. The comment justifying their
  // solo read said the due-soon count depends on them, which is true, but that
  // count is computed from rows in memory further down: nothing in this batch
  // needs the windows in order to be *issued*, only to be interpreted.
  const [
    { data: rfps },
    { data: everyRfp },
    { count: sectorCount },
    { data: orgProfile },
    { data: folders },
    { data: scoring },
    credit,
  ] = await Promise.all([
    sortByDeadline
      ? listQuery.order("due_at", { ascending: true, nullsFirst: false })
      : listQuery.order("score_percent", { ascending: false, nullsFirst: false }),
    supabase.from("rfps").select("status, folder_id, is_demo"),
    supabase.from("sector_experience").select("*", { count: "exact", head: true }),
    supabase.from("org_profile").select("profile_confirmed").eq("id", true).maybeSingle(),
    supabase.from("rfp_folders").select("*").order("sort_order").order("name"),
    supabase
      .from("scoring_settings")
      .select("deadline_warning_days,deadline_critical_days,go_threshold")
      .eq("id", true)
      .maybeSingle(),
    // Cached for five minutes inside the helper, so this costs one call per
    // five minutes rather than one per page load.
    openRouterCredit(process.env.OPENROUTER_API_KEY),
  ]);

  const windows = deadlineWindowsFrom(scoring);

  // Every number the filter chips show, from one pass over the projection above
  // rather than one round trip each.
  //
  // The two rows of chips narrow the same queue together, so each row counts
  // what clicking it would show *with the other row left as it is*. They used
  // to count the whole table independently, which reads as a bug the moment
  // the two disagree: selecting No-go emptied the queue while "All sections"
  // still said 2, so the highlighted chip claimed rows the page was not
  // showing. A facet count has to answer "how many if I click this", not "how
  // many exist".
  const all = everyRfp ?? [];
  const demoCount = all.reduce((n, r) => (r.is_demo ? n + 1 : n), 0);

  const inSection = (r: { folder_id: string | null }) => !folder || r.folder_id === folder;
  // Mirrors listQuery above: no view means everything except no-go, which is
  // why "All verdicts" is not simply the row count.
  const inView = (r: { status: string }) =>
    view === "no-go"
      ? r.status === "no_go"
      : view === "go"
        ? r.status === "go"
        : view === "pending"
          ? r.status === "pending"
          : r.status !== "no_go";

  // Section chips, counted inside the verdict that is currently selected.
  const forSections = all.filter(inView);
  const folderCounts: Record<string, number> = {};
  for (const r of forSections) {
    if (r.folder_id) folderCounts[r.folder_id] = (folderCounts[r.folder_id] ?? 0) + 1;
  }
  // "All" resets both filters, so it counts the default view across every
  // section rather than whatever is currently narrowed.
  const resetCount = all.reduce((n, r) => (r.status === "no_go" ? n : n + 1), 0);

  // Verdict chips, counted inside the section that is currently selected.
  const forVerdicts = all.filter(inSection);
  const byStatus = (status: string) =>
    forVerdicts.reduce((n, r) => (r.status === status ? n + 1 : n), 0);
  const totalCount = forVerdicts.reduce((n, r) => (r.status === "no_go" ? n : n + 1), 0);
  const goCount = byStatus("go");
  const maybeCount = byStatus("maybe");
  const noGoCount = byStatus("no_go");
  const pendingCount = byStatus("pending");

  const rows = rfps ?? [];


  return (
    <div className="mx-auto max-w-6xl">
      <CreditBanner credit={credit} />
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
        </div>
      </div>

      {/* Folders sit between the verdict cards and the list: the cards say what
          kind of work it is, the folders say which pile it belongs to, and both
          narrow the same queue underneath. */}
      <FolderBar
        folders={folders ?? []}
        counts={folderCounts}
        active={folder}
        resetCount={resetCount}
        viewActive={Boolean(view)}
        leading={
          <QueueFilter
            counts={{
              all: totalCount ?? 0,
              go: goCount ?? 0,
              maybe: maybeCount ?? 0,
              no_go: noGoCount ?? 0,
              pending: pendingCount ?? 0,
            }}
            active={view ?? null}
            sortByDeadline={sortByDeadline}
            folder={folder}
          />
        }
      />

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

            {/*
              Fixed layout with declared widths. Under automatic layout the six
              short columns claimed space on content that cannot wrap - a
              dollar amount, two dates, a select - and the one column that
              *should* absorb the slack was the one that got squeezed: the
              title wrapped to six lines in a 200px column while Budget and Due
              sat half empty. The title is what people scan, so it gets the
              room and everything else is sized to its content.
            */}
            <table className="hidden w-full table-fixed text-left text-sm md:table">
              <thead>
                <tr className="border-b border-rfp-border text-xs font-semibold uppercase tracking-wide text-rfp-ink-muted">
                  <th scope="col" className="w-[32%] px-4 py-3">RFP</th>
                  <th scope="col" className="w-[10%] px-4 py-3">Verdict</th>
                  <th scope="col" className="w-[10%] px-4 py-3">Score</th>
                  <th scope="col" className="w-[11%] px-4 py-3">Budget</th>
                  <th scope="col" className="hidden w-[13%] px-4 py-3 lg:table-cell">Section</th>
                  <th scope="col" className="hidden w-[12%] px-4 py-3 sm:table-cell">Arrived</th>
                  <th scope="col" className="w-[12%] px-4 py-3">Due</th>
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
