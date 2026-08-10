import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/StatCard";
import { VerdictBadge } from "@/components/VerdictBadge";
import { DemoBanner, DemoTag } from "@/components/DemoBanner";
import { ChartIcon, CheckCircleIcon, ClockIcon, DocumentIcon } from "@/components/icons";
import { daysUntil, deadlineColor, deadlineWindowsFrom, formatDate, isoDaysFromNow } from "@/lib/rfp";

/**
 * The "what is this thing and is it working" page.
 *
 * The queue answers "what should I do next". This answers the two questions
 * that come before it: how a solicitation actually moves through the desk, and
 * which parts of that path are live versus still waiting on someone. Every
 * status below is derived from real data or real configuration - nothing here
 * is a hardcoded green tick, because a checklist that lies is worse than none.
 */
export default async function OverviewPage() {
  const supabase = await createClient();

  // Triage runs in n8n, which this app talks to over a webhook. If either half
  // of that address is missing, submissions will queue and never get a verdict
  // - worth saying out loud rather than letting it look live.
  const triageConfigured = Boolean(process.env.N8N_BASE_URL && process.env.RFP_INTAKE_API_KEY);

  const { data: scoring } = await supabase
    .from("scoring_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  const windows = deadlineWindowsFrom(scoring);

  const [
    { count: totalCount },
    { count: goCount },
    { count: noGoCount },
    { count: pendingCount },
    { count: dueThisWeekCount },
    { count: sectorCount },
    { count: libraryCount },
    { count: rosterCount },
    { count: demoCount },
    { count: filedCount },
    { data: recent },
  ] = await Promise.all([
    supabase.from("rfps").select("*", { count: "exact", head: true }),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("status", "go"),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("status", "no_go"),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase
      .from("rfp_compliance_items")
      .select("*", { count: "exact", head: true })
      .eq("is_complete", false)
      .not("due_at", "is", null)
      .lte("due_at", isoDaysFromNow(windows.warningDays)),
    supabase.from("sector_experience").select("*", { count: "exact", head: true }),
    supabase.from("language_blocks").select("*", { count: "exact", head: true }),
    supabase.from("team_members").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("is_demo", true),
    supabase.from("rfps").select("*", { count: "exact", head: true }).eq("filing_status", "filed"),
    supabase
      .from("rfps")
      .select("id,title,client_agency,status,score_percent,due_at,verdict_set_at,is_demo")
      .order("verdict_set_at", { ascending: false, nullsFirst: false })
      .limit(6),
  ]);

  const profileReady = (sectorCount ?? 0) > 0;
  const libraryReady = (libraryCount ?? 0) > 0;
  const rosterReady = (rosterCount ?? 0) > 0;
  const filingConnected = (filedCount ?? 0) > 0;

  const decided = (goCount ?? 0) + (noGoCount ?? 0);
  const goRate = decided > 0 ? Math.round(((goCount ?? 0) / decided) * 100) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <DemoBanner count={demoCount ?? 0} />

      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Overview</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          How the bid desk works, and which parts of it are running.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Solicitations read"
          value={totalCount ?? 0}
          subtext={goRate === null ? "All time" : `${goRate}% cleared the gate`}
          icon={DocumentIcon}
          accent="#0a0a0a"
        />
        <StatCard
          label="Qualified (go)"
          value={goCount ?? 0}
          subtext="Worth Caravann's time"
          icon={CheckCircleIcon}
          accent="#1b8a5a"
        />
        <StatCard
          label="Ruled out"
          value={noGoCount ?? 0}
          subtext="Filed, never deleted"
          icon={ChartIcon}
          accent="#8f8d84"
        />
        <StatCard
          label={`Due within ${windows.warningDays} days`}
          value={dueThisWeekCount ?? 0}
          subtext="Open compliance items"
          icon={ClockIcon}
          accent="#d97a3a"
        />
      </div>

      {/* ─── The documented path, step by step ─────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-rfp-ink">
          How a solicitation moves through the desk
        </h2>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          Five steps from an email landing to a draft sitting in a folder. Each one says what it
          does and whether it is running yet.
        </p>

        <ol className="mt-5 space-y-3">
          <Step
            n={1}
            title="It arrives"
            state={triageConfigured ? "live" : "needs-setup"}
            summary="Two doors in: an email that mentions an RFP, or one you add by hand."
            href="/dashboard/new"
            hrefLabel="Add one now"
            warn={
              !triageConfigured ? (
                <Warn>
                  <code>N8N_BASE_URL</code> or <code>RFP_INTAKE_API_KEY</code> is not set on this
                  deployment, so anything submitted will sit in the queue as pending with no verdict.
                </Warn>
              ) : null
            }
          >
            The n8n workflow polls the mailbox every minute - not daily, because a solicitation
            posted at 9pm should be scored before the morning. Anything the mailbox misses, or
            anything you find yourself, goes in through{" "}
            <Nav href="/dashboard/new">Add a solicitation</Nav>.
            <Aside>
              The Gmail account is connected and the trigger is switched on. It watches for
              subjects mentioning an RFP, RFQ or solicitation - deliberately broad, because
              triaging a few irrelevant emails costs less than missing a real one. That switch
              lives in n8n rather than here, so this page reports what was last deployed, not
              live state.
            </Aside>
          </Step>

          <Step
            n={2}
            title="The whole document gets read"
            state={triageConfigured ? "live" : "needs-setup"}
            summary="One pass over the full text - the PDF where there is one, never just the summary."
          >
            A linked PDF is preferred, then a portal link, then the email body. That order matters:
            aggregator summaries paraphrase, and their dollar figures are often well off the real
            not-to-exceed amount. When only a summary is available, the model is told so and asked
            for a cautious verdict rather than a confident wrong one.
          </Step>

          <Step
            n={3}
            title="It gets a verdict"
            state={profileReady ? "live" : "needs-setup"}
            summary="Go, maybe or no-go with a score, judged against Caravann's own profile."
            href="/dashboard"
            hrefLabel="See the queue"
            warn={
              !profileReady ? (
                <Warn>
                  The sector experience map in <Nav href="/dashboard/settings">Settings</Nav> is
                  empty, so mandatory minimums like &ldquo;5+ years facilitating for public
                  agencies&rdquo; fail on an empty record. Verdicts will read no-go on work
                  Caravann would win until those numbers are in.
                </Warn>
              ) : null
            }
          >
            The same pass pulls out the budget, the gap list, the compliance checklist with its
            deadlines, the disqualifier checks, and the questions worth asking the agency before
            the question deadline. No-go RFPs drop into their own folder rather than disappearing.
            <span className="block rounded-lg border border-rfp-border bg-rfp-surface-sunken p-3">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-rfp-ink-muted">
                Where the line sits right now
              </span>
              <span className="tabular mt-1.5 block text-[13px] text-rfp-ink-secondary">
                <strong className="font-semibold text-rfp-good">Go</strong> at{" "}
                {scoring?.go_threshold ?? 85}% and above ·{" "}
                <strong className="font-semibold text-rfp-warning">Maybe</strong> from{" "}
                {scoring?.maybe_threshold ?? 60}% ·{" "}
                <strong className="font-semibold text-rfp-critical">No-go</strong> below that, or
                whenever a mandatory requirement fails.
              </span>
              <span className="mt-1.5 block text-xs">
                The model reports the score; these numbers decide the label, so the same
                solicitation always gets the same verdict.{" "}
                <Nav href="/dashboard/settings">Change them in Settings</Nav>.
              </span>
            </span>

          </Step>

          <Step
            n={4}
            title="The bid gets prepared"
            state={libraryReady && rosterReady ? "live" : "needs-setup"}
            summary="A team suggestion off the roster, and a first draft stitched from past wins."
            warn={
              <>
                {!libraryReady && (
                  <Warn>
                    The <Nav href="/dashboard/library">approved-language library</Nav> is empty, so
                    every section will come back as needs-writing. Loading it from past winning
                    proposals is what makes a draft sound like Caravann.
                  </Warn>
                )}
                {!rosterReady && (
                  <Warn>
                    No active team members in <Nav href="/dashboard/settings">Settings</Nav>, so
                    there is nobody to match against.
                  </Warn>
                )}
              </>
            }
          >
            Team match ranks the roster against what the solicitation actually asks for; nothing is
            assigned until you confirm it. The draft is assembled only from approved language -
            a section with nothing on file comes back marked{" "}
            <em>needs writing by hand</em> rather than filled with invented text, because this
            document goes to a public agency. Finished drafts export as .docx.
          </Step>

          <Step
            n={5}
            title="It gets filed"
            state={filingConnected ? "live" : "not-connected"}
            summary="A folder per verdict, a subfolder per bid, everything renamed to your format."
          >
            The folder structure and the{" "}
            <code className="rounded bg-rfp-surface-sunken px-1 py-0.5 text-[11px]">
              [Engagement]_[Client]_Caravann Consulting
            </code>{" "}
            naming are settled and shown on every RFP. The Drive call itself needs a Google account
            authorised in n8n - the same one-time consent the email trigger needs. Until then the
            desk records where a file <em>would</em> go and moves nothing.
          </Step>
        </ol>
      </section>

      {/* ─── What is still waiting on a person ─────────────────────────── */}
      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold text-rfp-ink">Setup checklist</h2>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          What the desk still needs before its verdicts can be taken at face value.
        </p>

        <ul className="mt-4 divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
          <Task
            done={profileReady}
            title="Fill in the eligibility profile and sector map"
            detail="Years and engagements per sector, capability flags, office locations, certifications. Every disqualifier check reads these."
            href="/dashboard/settings"
          />
          <Task
            done={rosterReady}
            title="Add the team roster"
            detail="Names, roles, rates and qualifications. Team match ranks against this list."
            href="/dashboard/settings"
          />
          <Task
            done={libraryReady}
            title="Load the approved-language library"
            detail="Sections from proposals Caravann has already won. Drafts are stitched from these and nothing else."
            href="/dashboard/library"
          />
          <Task
            done={null}
            title="Connect the Gmail trigger in n8n"
            detail="A one-time browser sign-in that turns manual adds into hands-free intake. Lives in n8n, so this page cannot see whether it is done."
          />
          <Task
            done={filingConnected}
            title="Authorise Google Drive for filing"
            detail="The last step of the path. Until it is connected, filing records intent only."
          />
        </ul>
      </section>

      {/* ─── Latest decisions ──────────────────────────────────────────── */}
      <section className="mt-10 mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-rfp-ink">Latest decisions</h2>
            <p className="mt-1 text-sm text-rfp-ink-secondary">
              Most recently ruled on{pendingCount ? `, with ${pendingCount} still in triage` : ""}.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg border border-rfp-border px-3 py-1.5 text-xs font-medium text-rfp-ink-secondary press hover:bg-rfp-surface-sunken"
          >
            Open the queue
          </Link>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
          {!recent || recent.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-rfp-ink-muted">
              Nothing has come through yet. The first solicitation - emailed in or added by hand -
              shows up here with its verdict.
            </p>
          ) : (
            <ul className="divide-y divide-rfp-border">
              {recent.map((rfp) => {
                const days = daysUntil(rfp.due_at);
                return (
                  <li key={rfp.id}>
                    <Link
                      href={`/dashboard/rfps/${rfp.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 press hover:bg-rfp-surface-sunken/60"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-rfp-ink">
                          {rfp.title}
                          {rfp.is_demo && <DemoTag />}
                        </p>
                        <p className="truncate text-xs text-rfp-ink-muted">{rfp.client_agency}</p>
                      </div>
                      <span className="tabular hidden shrink-0 text-sm text-rfp-ink-secondary sm:block">
                        {rfp.score_percent !== null ? `${Math.round(rfp.score_percent)}%` : "-"}
                      </span>
                      <span
                        className="hidden shrink-0 text-xs font-medium sm:block"
                        style={{ color: deadlineColor(days, windows) }}
                      >
                        {formatDate(rfp.due_at)}
                      </span>
                      <VerdictBadge status={rfp.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── presentational helpers ─────────────────────────────────────────────── */

type StepState = "live" | "needs-setup" | "not-connected";

const STEP_STATE: Record<StepState, { label: string; color: string }> = {
  live: { label: "Running", color: "var(--rfp-good)" },
  "needs-setup": { label: "Needs setup", color: "var(--rfp-warning)" },
  "not-connected": { label: "Not connected", color: "var(--rfp-ink-muted)" },
};

function Step({
  n,
  title,
  state,
  summary,
  href,
  hrefLabel,
  warn,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  summary: string;
  href?: string;
  hrefLabel?: string;
  /** Anything needing action. Rendered outside the fold, because a warning
   *  nobody opens is not a warning. */
  warn?: React.ReactNode;
  children: React.ReactNode;
}) {
  const meta = STEP_STATE[state];
  return (
    <li className="relative rounded-xl border border-rfp-border bg-rfp-surface p-5">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rfp-black text-xs font-semibold text-white">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-sm font-semibold text-rfp-ink">{title}</h3>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                color: meta.color,
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-rfp-ink-secondary">{summary}</p>
          {warn}
          {/* The detail is folded away by default.
              Each step carried a paragraph explaining why it works the way it
              does, which is genuinely useful the first time and a wall of text
              every time after. Five of them stacked turned a dashboard into an
              essay. The title, the state and one line of summary are what you
              actually scan for; the reasoning is one click away when you want
              it, and closed when you do not. */}
          <details className="group mt-2">
            <summary className="press inline-flex cursor-pointer list-none items-center gap-1 text-xs font-semibold text-rfp-ink-muted hover:text-rfp-ink">
              <span className="inline-block transition-transform duration-200 group-open:rotate-90">›</span>
              How this works
            </summary>
            <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-rfp-ink-muted">
              {children}
            </div>
          </details>
          {href && (
            <Link
              href={href}
              className="mt-3 inline-block text-xs font-semibold text-rfp-gold hover:underline"
            >
              {hrefLabel} →
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** Sits outside the fold on purpose: a warning nobody opens is not a warning. */
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 rounded-lg border border-rfp-warning/40 bg-rfp-warning/10 p-2.5 text-[13px] leading-relaxed text-rfp-ink-secondary">
      {children}
    </p>
  );
}

function Aside({ children }: { children: React.ReactNode }) {
  return <p className="border-l-2 border-rfp-border pl-3 text-[13px] italic">{children}</p>;
}

function Nav({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-rfp-gold hover:underline">
      {children}
    </Link>
  );
}

/** `done: null` means the answer lives outside this app - shown as an open
 *  circle rather than a tick or a cross, because guessing either way would be
 *  a checklist item that lies. */
function Task({
  done,
  title,
  detail,
  href,
}: {
  done: boolean | null;
  title: string;
  detail: string;
  href?: string;
}) {
  const color =
    done === true ? "var(--rfp-good)" : done === false ? "var(--rfp-warning)" : "var(--rfp-ink-muted)";
  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <span
        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: color, background: done === true ? color : "transparent" }}
      >
        {done === true && (
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white" aria-hidden>
            <path
              d="M2 5.2l2 2 4-4.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${done === true ? "text-rfp-ink-muted line-through" : "text-rfp-ink"}`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">{detail}</p>
      </div>
      {href && done !== true && (
        <Link
          href={href}
          className="shrink-0 text-xs font-semibold text-rfp-gold hover:underline"
        >
          Open →
        </Link>
      )}
    </li>
  );
}
