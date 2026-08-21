import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WhereTheyComeFrom } from "@/components/WhereTheyComeFrom";
import { VerdictBadge } from "@/components/VerdictBadge";
import { DemoBanner, DemoTag } from "@/components/DemoBanner";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatDate, isoDaysFromNow } from "@/lib/rfp";

/**
 * What is waiting, and is the desk healthy.
 *
 * It used to lead with five numbered cards explaining how a solicitation moves
 * through the system. Numbering them made them read as steps to carry out - a
 * to-do list where the reader is the one doing the work - when they were only
 * ever a description of the machine. Nobody opening a dashboard on a Tuesday
 * needs the architecture explained again.
 *
 * So the order is inverted. What needs attention comes first, the pipeline is
 * one strip of dots that says at a glance whether anything is broken, and the
 * explanation is a link for the one day someone wants it.
 *
 * Every status is derived from real data or real configuration. Nothing here is
 * a hardcoded green tick, because a checklist that lies is worse than none.
 */
export default async function OverviewPage() {
  const supabase = await createClient();

  // Triage runs in n8n, which this app talks to over a webhook. If either half
  // of that address is missing, submissions will queue and never get a verdict
  // - worth saying out loud rather than letting it look live.
  const triageConfigured = Boolean(process.env.N8N_BASE_URL && process.env.RFP_INTAKE_API_KEY);

  // One wave. This page used to take two, and fourteen queries to do it.
  //
  // Six of them were counts on rfps: every bid, then go, then no-go, then
  // pending, then demo, then filed. Six network round trips to ask one table
  // six questions about the same rows. One projection answers all six.
  //
  // The second wave existed because the open-compliance count filtered on
  // `now + warningDays`, and the window is stored in scoring_settings, so that
  // read had to finish before the batch could be issued. Fetching the due
  // dates instead of a count removes the dependency: the window is applied
  // here rather than in Postgres, and scoring_settings joins the batch. The
  // projection is narrow and bounded to items that are incomplete and actually
  // carry a date, which is the only set that can ever be counted.
  const [
    { data: allRfps },
    { data: openCompliance },
    { count: sectorCount },
    { count: libraryCount },
    { count: rosterCount },
    { data: health },
    { data: orgProfile },
    { data: recent },
    { data: scoring },
  ] = await Promise.all([
    // `source` rides along on a query this page already makes. It has been
    // recorded on every bid since the first migration and never once shown.
    supabase.from("rfps").select("status, is_demo, filing_status, source"),
    supabase
      .from("rfp_compliance_items")
      .select("due_at")
      .eq("is_complete", false)
      .not("due_at", "is", null),
    supabase.from("sector_experience").select("*", { count: "exact", head: true }),
    supabase.from("language_blocks").select("*", { count: "exact", head: true }),
    supabase.from("team_members").select("*", { count: "exact", head: true }).eq("active", true),
    // Whether Drive works is a fact about Drive, not about how many bids
    // happen to be sitting in the queue. Clearing the queue used to make the
    // overview announce that Google Drive still needed authorising.
    supabase.from("connection_events").select("kind,last_ok_at,detail"),
    supabase.from("org_profile").select("insurance_coverage,set_aside_status,profile_confirmed").eq("id", true).maybeSingle(),
    supabase
      .from("rfps")
      .select("id,title,client_agency,status,score_percent,due_at,verdict_set_at,is_demo")
      .order("verdict_set_at", { ascending: false, nullsFirst: false })
      .limit(6),
    supabase.from("scoring_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  const windows = deadlineWindowsFrom(scoring);

  // Every solicitation, counted directly. This used to be go + no-go + pending
  // added together, which silently excluded maybe - the single most common
  // verdict - so a queue holding one maybe reported that nothing had been read
  // at all.
  const rfpRows = allRfps ?? [];
  const countWhere = (keep: (r: (typeof rfpRows)[number]) => boolean) =>
    rfpRows.reduce((n, r) => (keep(r) ? n + 1 : n), 0);
  const totalCount = rfpRows.length;
  const goCount = countWhere((r) => r.status === "go");
  const noGoCount = countWhere((r) => r.status === "no_go");
  const pendingCount = countWhere((r) => r.status === "pending");
  const demoCount = countWhere((r) => r.is_demo);
  const filedCount = countWhere((r) => r.filing_status === "filed");

  const warningCutoff = isoDaysFromNow(windows.warningDays);
  const dueThisWeekCount = (openCompliance ?? []).reduce(
    (n, c) => (c.due_at && c.due_at <= warningCutoff ? n + 1 : n),
    0,
  );

  const profileReady = (sectorCount ?? 0) > 0;
  const libraryReady = (libraryCount ?? 0) > 0;
  const rosterReady = (rosterCount ?? 0) > 0;
  const worked = new Map((health ?? []).map((h) => [h.kind, h]));
  const filingConnected = worked.has("drive") || (filedCount ?? 0) > 0;
  const triageWorking = worked.has("triage");

  const decided = (goCount ?? 0) + (noGoCount ?? 0);
  const goRate = decided > 0 ? Math.round(((goCount ?? 0) / decided) * 100) : null;

  // Only what is not done. A checklist of five items where four are ticked is
  // four lines of noise around the one that matters, and once everything is
  // ready the section disappears rather than sitting there permanently green.
  // What is genuinely unfinished, which is not the same as what has not run
  // recently. Connections that have demonstrably worked never appear here.
  const setup = [
    { done: profileReady, label: "Fill in the eligibility profile and sector map", href: "/dashboard/settings" },
    { done: rosterReady, label: "Add the team roster", href: "/dashboard/settings" },
    { done: libraryReady, label: "Load the approved-language library", href: "/dashboard/library" },
    { done: triageConfigured || triageWorking, label: "Connect triage to n8n", href: "/dashboard/settings" },
    { done: filingConnected, label: "Authorise Google Drive for filing", href: "/dashboard/settings" },
    // The two blank profile fields, which are the reason good bids stall at
    // maybe. Worth more of Khaled's attention than anything else on this page.
    { done: Boolean(orgProfile?.insurance_coverage), label: "Record the insurance Caravann carries", href: "/dashboard/settings" },
    { done: orgProfile?.profile_confirmed === true, label: "Confirm the profile, so verdicts stop being provisional", href: "/dashboard/settings" },
  ];
  const outstanding = setup.filter((s) => !s.done);

  const attention = [
    { n: pendingCount ?? 0, label: "awaiting a verdict", href: "/dashboard?view=pending", urgent: false },
    { n: dueThisWeekCount ?? 0, label: `due within ${windows.warningDays} days`, href: "/dashboard?sort=deadline", urgent: true },
  ].filter((a) => a.n > 0);

  // One dot per stage. Green when that part of the path has actually done
  // something, amber when it is waiting on a person. Derived, never asserted.
  const pipeline = [
    { label: "Arrives", live: triageConfigured },
    { label: "Read", live: triageConfigured },
    { label: "Verdict", live: profileReady },
    { label: "Prepared", live: libraryReady && rosterReady },
    { label: "Filed", live: filingConnected },
  ];

  // Where solicitations actually come from, which is the evidence for whether
  // this desk needs to go looking for work or only to judge what it is handed.
  const arrivals = { aggregator: 0, email: 0, manual: 0, portal: 0 };
  for (const r of allRfps ?? []) {
    const k = r.source as keyof typeof arrivals | null;
    if (k && k in arrivals) arrivals[k] += 1;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <DemoBanner count={demoCount ?? 0} />

      <div className="rise mb-8">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Overview</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          {attention.length === 0
            ? "Nothing is waiting. Every solicitation has a verdict and no deadline is inside the week."
            : "What needs you, and whether the desk is running."}
        </p>
      </div>

      {/* What needs attention. First, because it is the only thing here anyone
          can act on, and it disappears entirely when there is nothing. */}
      {attention.length > 0 && (
        <div className={`rise-stagger mb-10 grid grid-cols-1 gap-3 ${attention.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {attention.map((a, i) => (
            <Link
              key={a.label}
              href={a.href}
              style={{ "--i": i } as CSSProperties}
              className="press press-card lift group rounded-xl border border-rfp-border bg-rfp-surface p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rfp-gold focus-visible:ring-offset-2"
            >
              <p className="tabular font-display text-4xl font-semibold" style={{ color: a.urgent ? "var(--rfp-warning)" : "var(--rfp-ink)" }}>
                {a.n}
              </p>
              <p className="mt-1 text-sm text-rfp-ink-secondary">
                {a.label}
                <span className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5">→</span>
              </p>
            </Link>
          ))}
        </div>
      )}

      {/* What the desk has actually done. The page had nothing on it until a
          solicitation arrived, which made a working system look like an empty
          one, and these are the numbers anyone asking "is this thing earning
          its keep" wants first. */}
      <section className="rise mb-10">
        <h2 className="mb-3 font-display text-sm font-semibold text-rfp-ink">The desk so far</h2>
        <dl className="rise-stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Read", value: totalCount ?? 0 },
            { label: "Worth bidding", value: goCount ?? 0 },
            { label: "Ruled out", value: noGoCount ?? 0 },
            { label: "Filed to Drive", value: filedCount ?? 0 },
          ].map((stat, i) => (
            <div
              key={stat.label}
              style={{ "--i": i } as CSSProperties}
              className="rounded-xl border border-rfp-border bg-rfp-surface p-4"
            >
              <dd className="tabular font-display text-2xl font-semibold text-rfp-ink">{stat.value}</dd>
              <dt className="mt-0.5 text-xs text-rfp-ink-muted">{stat.label}</dt>
            </div>
          ))}
        </dl>
        {/* The go rate is stated once, beside Latest decisions, where the
            decisions it is a rate of are actually listed. */}
      </section>

      {/* The pipeline, as one line. Five numbered cards became five dots: the
          only question a running system raises daily is whether any part of it
          has stopped, and that is a colour, not a paragraph. */}
      <section className="rise mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-rfp-ink">The path a solicitation takes</h2>
          <Link href="/dashboard/settings" className="press text-xs font-medium text-rfp-ink-muted hover:text-rfp-ink">
            Settings →
          </Link>
        </div>
        <div className="relative rounded-xl border border-rfp-border bg-rfp-surface px-3 py-5 sm:px-5">
          {/* The connector, behind the dots. Inset by half a column at each end
              so it starts and stops at the first and last dot rather than
              running off into the padding. */}
          <span
            aria-hidden
            className="pipeline-line absolute left-[10%] right-[10%] top-[26px] h-px origin-left bg-rfp-border-strong"
          />
          <ol className="rise-stagger relative grid grid-cols-5">
            {pipeline.map((stage, i) => (
              <li
                key={stage.label}
                style={{ "--i": i } as CSSProperties}
                className="flex flex-col items-center gap-2 text-center"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full ring-4 ring-rfp-surface"
                  style={{ background: stage.live ? "var(--rfp-good)" : "var(--rfp-warning)" }}
                />
                <span className="text-[11px] font-medium leading-tight text-rfp-ink sm:text-[13px]">
                  {stage.label}
                </span>
              </li>
            ))}
          </ol>
        </div>
        {pipeline.some((s) => !s.live) && (
          <p className="mt-2 text-xs text-rfp-ink-muted">
            Amber means that part is waiting on something below, not that it is broken.
          </p>
        )}
      </section>

      {/* Setup, only while there is any. */}
      {outstanding.length > 0 && (
        <section className="rise mb-10">
          <h2 className="mb-3 font-display text-sm font-semibold text-rfp-ink">
            {outstanding.length} thing{outstanding.length > 1 ? "s" : ""} left to set up
          </h2>
          <ul className="rise-stagger divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
            {outstanding.map((item, i) => (
              <li key={item.label} style={{ "--i": i } as CSSProperties}>
                <Link
                  href={item.href}
                  className="press press-row flex min-h-11 items-center gap-3 px-5 py-3 text-sm text-rfp-ink hover:bg-rfp-surface-sunken/60"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rfp-warning" />
                  <span className="flex-1">{item.label}</span>
                  <span aria-hidden className="text-rfp-ink-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Latest decisions. */}
      {recent && recent.length > 0 && (
        <section className="rise">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-rfp-ink">Latest decisions</h2>
            {goRate !== null && (
              <span className="tabular text-xs text-rfp-ink-muted">{goRate}% of decided cleared the gate</span>
            )}
          </div>
          <ul className="rise-stagger divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
            {recent.map((r, i) => (
              <li key={r.id} style={{ "--i": i } as CSSProperties}>
                <Link
                  href={`/dashboard/rfps/${r.id}`}
                  className="press press-row flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-rfp-surface-sunken/60"
                >
                  <VerdictBadge status={r.status} />
                  <span className="min-w-0 flex-1 truncate text-sm text-rfp-ink">
                    {r.title}
                    {r.is_demo && <DemoTag />}
                  </span>
                  <span className="flex basis-full items-center gap-3 sm:basis-auto">
                    <span className="tabular text-xs text-rfp-ink-muted">
                      {r.score_percent !== null ? `${Math.round(r.score_percent)}%` : ""}
                    </span>
                    <span className="text-xs" style={{ color: deadlineColor(daysUntil(r.due_at), windows) }}>
                      {formatDate(r.due_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <WhereTheyComeFrom counts={arrivals} />

    </div>
  );
}
