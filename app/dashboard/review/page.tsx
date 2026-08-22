import { createClient } from "@/lib/supabase/server";
import { EdgeCaseList, PortalRules } from "@/components/ReviewQueue";
import { ReviewSteps } from "@/components/ReviewSteps";

// Module 11 - the weekly pass. Everything the system was unsure about, plus
// the portal quirks it has been taught, in one place to clear in a sitting.
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { calibrate, type Override } from "@/lib/calibration";
import { learnPreferences } from "@/lib/preferences";
import { loadBidSignals } from "@/lib/preference-loader";

export default async function ReviewPage() {
  const supabase = await createClient();

  // The behavioural signals go out with everything else rather than after it.
  //
  // They were awaited on their own line below, after this batch had already
  // resolved, and loadBidSignals is itself two dependent waves: the recent
  // bids, then four grouped counts keyed to their ids. That made three waves
  // in sequence on the slowest page in the app, about 270ms each against a
  // remote Postgres, and none of it needed the others. This batch does not
  // depend on the signals and the signals do not depend on this batch, so the
  // only thing the sequence was buying was latency.
  const [
    [{ data: pending }, { data: resolved }, { data: rules }, { data: decided }, { data: scoring }],
    signals,
  ] = await Promise.all([
    Promise.all([
    supabase.from("rfp_edge_cases").select("*").eq("status", "pending").order("created_at"),
    supabase
      .from("rfp_edge_cases")
      .select("*")
      .neq("status", "pending")
      .order("resolved_at", { ascending: false })
      .limit(10),
    supabase.from("portal_rules").select("*").order("portal_name"),
    // Every bid a person put their own verdict on. The comparison against what
    // the desk computed is the only measure of whether any of this is right.
    supabase
      .from("rfps")
      .select("id, title, status, human_verdict, human_verdict_note, human_verdict_at, score_percent")
      .not("human_verdict", "is", null)
      .order("human_verdict_at", { ascending: false })
      .limit(100),
    supabase.from("scoring_settings").select("go_threshold").eq("id", true).maybeSingle(),
    ]),
    loadBidSignals(supabase),
  ]);

  const calibration = calibrate(
    (decided ?? []).map(
      (r): Override => ({
        id: r.id,
        title: r.title,
        computed: r.status as Override["computed"],
        human: r.human_verdict as Override["human"],
        score: r.score_percent,
        note: r.human_verdict_note,
        decidedAt: r.human_verdict_at,
      }),
    ),
    scoring?.go_threshold ?? 70,
  );

  const preferences = learnPreferences(signals);

  const pendingCases = pending ?? [];
  const portalRules = rules ?? [];
  const resolvedCases = resolved ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Weekly review</h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-rfp-ink-secondary">
          Four things to look at once a week. Nothing on this page changes anything until you say
          so, and you can leave any step without deciding.
        </p>
      </div>

      <ReviewSteps
        steps={[
          {
            key: "calibration",
            tab: "How it is doing",
            title: "Is the desk agreeing with you?",
            lede:
              "Every time you overrule a verdict, that disagreement is recorded. This compares what the desk decided against what you decided, and proposes a threshold change when a pattern is clear enough to act on. It never changes a threshold itself.",
            body: <CalibrationPanel calibration={calibration} preferences={preferences} />,
          },
          {
            key: "waiting",
            tab: "Waiting on you",
            title: "Cases the desk could not settle",
            lede:
              "These are not mistakes. They are the bids where the desk was genuinely unsure and said so, and each one is here because a person can settle it in a few seconds.",
            count: pendingCases.length,
            needsYou: true,
            body: (
              <>
                <ul className="mb-4 space-y-1.5 text-sm text-rfp-ink-secondary">
                  <li className="flex gap-2">
                    <span aria-hidden className="text-rfp-ink-muted">·</span>
                    <span>The two reads disagreed by more than your tolerance allows</span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-rfp-ink-muted">·</span>
                    <span>A mandatory requirement could not be confirmed either way</span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-rfp-ink-muted">·</span>
                    <span>The score landed within two points of a threshold, where a rerun could flip the label</span>
                  </li>
                </ul>
                <p className="mb-3 text-sm text-rfp-ink-secondary">
                  <strong className="font-semibold text-rfp-ink">Approve</strong> applies the change
                  the desk suggests.{" "}
                  <strong className="font-semibold text-rfp-ink">Reject</strong> records that you
                  looked and disagreed. Either way the case clears.
                </p>
                <EdgeCaseList items={pendingCases} />
              </>
            ),
          },
          {
            key: "portals",
            tab: "Portal rules",
            title: "Things a portal does that no RFP tells you",
            lede:
              "Every procurement site has its own quirks, and they are almost never written in the solicitation. Teach the desk one here and it goes onto the compliance checklist of every future bid on that portal, so nobody has to remember it again.",
            count: portalRules.length,
            body: (
              <>
                <ul className="mb-4 space-y-1.5 text-sm text-rfp-ink-secondary">
                  <li className="flex gap-2">
                    <span aria-hidden className="text-rfp-ink-muted">·</span>
                    <span>
                      <span className="font-medium text-rfp-ink">eVA</span> will not accept an upload
                      that is still in progress at the deadline
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span aria-hidden className="text-rfp-ink-muted">·</span>
                    <span>
                      <span className="font-medium text-rfp-ink">PlanetBids</span> runs a separate
                      portal per agency, so registering on one is not registering on another
                    </span>
                  </li>
                </ul>
                <PortalRules rules={portalRules} />
              </>
            ),
          },
          {
            key: "resolved",
            tab: "Already done",
            title: "What you cleared recently",
            lede:
              "The last ten cases you settled, so you can see what was decided and catch anything you would now call differently.",
            count: resolvedCases.length,
            body:
              resolvedCases.length === 0 ? (
                <p className="rounded-xl border border-rfp-border bg-rfp-surface px-5 py-4 text-sm text-rfp-ink-muted">
                  Nothing cleared yet.
                </p>
              ) : (
                <ul className="divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
                  {resolvedCases.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3">
                      <p className="text-sm text-rfp-ink-secondary">{c.description}</p>
                      <span
                        className="shrink-0 text-[11px] font-semibold uppercase tracking-wide"
                        style={{
                          color: c.status === "approved" ? "var(--rfp-good)" : "var(--rfp-ink-muted)",
                        }}
                      >
                        {c.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </div>
  );
}
