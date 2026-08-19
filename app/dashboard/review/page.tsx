import { createClient } from "@/lib/supabase/server";
import { EdgeCaseList, PortalRules } from "@/components/ReviewQueue";

// Module 11 - the weekly pass. Everything the system was unsure about, plus
// the portal quirks it has been taught, in one place to clear in a sitting.
import { CalibrationPanel } from "@/components/CalibrationPanel";
import { calibrate, type Override } from "@/lib/calibration";

export default async function ReviewPage() {
  const supabase = await createClient();

  const [{ data: pending }, { data: resolved }, { data: rules }, { data: decided }, { data: scoring }] =
    await Promise.all([
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-rfp-ink">Weekly review</h1>
        <p className="mt-1 text-sm text-rfp-ink-secondary">
          Edge cases and proposed rule changes. Nothing applies until you approve it.
        </p>
      </div>

      {/* First, because it answers the question the rest of the page assumes:
          whether the desk's judgement is worth reviewing at all. */}
      <CalibrationPanel calibration={calibration} />

      <h2 className="font-display text-sm font-semibold text-rfp-ink">
        Waiting on you{pending?.length ? ` (${pending.length})` : ""}
      </h2>
      <div className="mt-3">
        <EdgeCaseList items={pending ?? []} />
      </div>

      <h2 className="mt-8 font-display text-sm font-semibold text-rfp-ink">Portal rules</h2>
      <p className="mt-0.5 text-xs text-rfp-ink-muted">
        Taught once, applied to that portal&rsquo;s compliance checklist every time after.
      </p>
      <div className="mt-3">
        <PortalRules rules={rules ?? []} />
      </div>

      {resolved && resolved.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-sm font-semibold text-rfp-ink">Recently resolved</h2>
          <ul className="mt-3 divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
            {resolved.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <p className="text-sm text-rfp-ink-secondary">{c.description}</p>
                <span
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: c.status === "approved" ? "var(--rfp-good)" : "var(--rfp-ink-muted)" }}
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
