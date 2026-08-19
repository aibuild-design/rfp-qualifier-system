import Link from "next/link";
import type { Calibration } from "@/lib/calibration";
import { MIN_FOR_A_PATTERN } from "@/lib/calibration";
import { MIN_PURSUED, type Preferences } from "@/lib/preferences";

/**
 * How often the desk agrees with Khaled, and what to change where it does not.
 *
 * This is the only page that measures the thing that actually matters. Every
 * other number in the product describes consistency: the same document reaching
 * the same verdict. None of it says whether the verdict is *right*, and the
 * only evidence for that is how often a person overrules it.
 *
 * Nothing here changes anything on its own. Each proposal names the change, the
 * evidence, and how many decisions it rests on, and waits. A desk that retunes
 * its own thresholds drifts toward agreeing with whatever it did last, which
 * looks like learning from the outside.
 */
export function CalibrationPanel({
  calibration,
  preferences,
}: {
  calibration: Calibration;
  preferences: Preferences;
}) {
  const { decided, agreed, agreementRate, tooHarsh, tooGenerous, proposals } = calibration;

  // The preference readout shows either way. It learns from behaviour rather
  // than from recorded verdicts, so it has something to say on a desk where
  // nobody has written a verdict down yet - which is exactly when a person is
  // most likely to be wondering whether any of this is paying attention.
  if (decided === 0) {
    return (
      <section className="mt-8">
        <h2 className="font-display text-sm font-semibold text-rfp-ink">Is the desk any good?</h2>
        <p className="mt-3 rounded-xl border border-dashed border-rfp-border-strong bg-rfp-surface px-5 py-4 text-sm leading-relaxed text-rfp-ink-secondary">
          No recorded verdicts yet. Every time you record your own call on a bid, especially where
          you disagree with the desk, it is compared against what the desk said. After about{" "}
          {MIN_FOR_A_PATTERN} decisions this starts telling you where the scoring is wrong, and
          your reasons go into every future triage as worked examples.
        </p>
        <PreferenceReadout preferences={preferences} />
      </section>
    );
  }

  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Is the desk any good?</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
        Measured against your own calls, which is the only evidence there is. Nothing here
        changes until you say so.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "You decided", value: String(decided) },
          { label: "Agreed", value: String(agreed) },
          {
            label: "Agreement",
            value: agreementRate === null ? "-" : `${agreementRate}%`,
            hint: agreementRate === null ? `needs ${MIN_FOR_A_PATTERN}` : undefined,
          },
          { label: "Overruled", value: String(tooHarsh.length + tooGenerous.length) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-rfp-border bg-rfp-surface px-4 py-3">
            <p className="font-display text-2xl font-semibold tabular-nums leading-none text-rfp-ink">
              {s.value}
            </p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
              {s.hint ?? s.label}
            </p>
          </div>
        ))}
      </div>

      {proposals.length > 0 && (
        <ul className="mt-3 space-y-2">
          {proposals.map((p) => (
            <li
              key={p.change}
              className="rounded-xl border bg-rfp-surface px-5 py-4"
              style={{ borderColor: "var(--rfp-gold)" }}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-rfp-gold">
                  {p.kind === "threshold" ? "Scoring" : p.kind === "profile" ? "Settings" : "Worth a look"}
                </span>
                <span className="text-sm font-semibold text-rfp-ink">{p.change}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-rfp-ink-secondary">{p.evidence}</p>
              <p className="mt-1 text-[11px] text-rfp-ink-muted">
                Based on {p.basedOn} decision{p.basedOn === 1 ? "" : "s"}.{" "}
                {p.kind === "threshold" ? (
                  <Link href="/dashboard/settings" className="font-medium text-rfp-gold hover:underline">
                    Change it in Settings
                  </Link>
                ) : p.kind === "profile" ? (
                  <Link href="/dashboard/settings" className="font-medium text-rfp-gold hover:underline">
                    Fill it in Settings
                  </Link>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}

      {(tooHarsh.length > 0 || tooGenerous.length > 0) && (
        <div className="mt-3 overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
          <p className="border-b border-rfp-border px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
            Where you overruled it
          </p>
          <ul className="divide-y divide-rfp-border">
            {[...tooHarsh, ...tooGenerous].slice(0, 10).map((o) => (
              <li key={o.id} className="px-5 py-3">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <Link
                    href={`/dashboard/rfps/${o.id}`}
                    className="text-sm font-medium text-rfp-ink hover:text-rfp-gold"
                  >
                    {o.title}
                  </Link>
                  <span className="text-xs text-rfp-ink-muted">
                    desk said <strong className="text-rfp-ink-secondary">{o.computed}</strong>
                    {typeof o.score === "number" ? ` at ${o.score}%` : ""}, you said{" "}
                    <strong className="text-rfp-ink-secondary">{o.human}</strong>
                  </span>
                </div>
                {o.note && (
                  <p className="mt-1 text-xs leading-relaxed text-rfp-ink-secondary">{o.note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PreferenceReadout preferences={preferences} />

      <p className="mt-3 text-xs leading-relaxed text-rfp-ink-muted">
        Your reasons are also sent into every future triage as worked examples, so a correction
        made once is weighed on the next solicitation rather than having to be made again.
      </p>
    </section>
  );
}

/**
 * What the desk has worked out about the kind of work he takes.
 *
 * Learned from effort rather than attention: a bid he drafted or staffed counts,
 * a bid he opened does not. Shown so he can disagree with it, which is the point
 * of showing it at all. A preference model nobody can see is a preference model
 * nobody can correct.
 */
function PreferenceReadout({ preferences }: { preferences: Preferences }) {
  const { pursued, rejected, ignored, likes, avoids, enoughToSay } = preferences;

  return (
    <div className="mt-3 rounded-xl border border-rfp-border bg-rfp-surface px-5 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        The kind of work you take
      </p>

      {!enoughToSay ? (
        <p className="mt-2 text-sm leading-relaxed text-rfp-ink-secondary">
          Not enough yet. {pursued} bid{pursued === 1 ? "" : "s"} pursued, {rejected} turned down,{" "}
          {ignored} let go. After about {MIN_PURSUED} pursued this starts describing what they have
          in common, read from what you did rather than what you clicked: drafting one, putting
          people on it, or letting a deadline pass in silence.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-rfp-ink-muted">
            From {pursued} pursued against {rejected + ignored} you did not. Drafting or staffing a
            bid counts; opening one does not.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--rfp-good)" }}>
                You go for
              </p>
              <ul className="mt-1.5 space-y-1">
                {likes.length === 0 && <li className="text-sm text-rfp-ink-muted">No clear lean.</li>}
                {likes.slice(0, 5).map((t) => (
                  <li key={t.label} className="flex items-baseline gap-2 text-sm text-rfp-ink-secondary">
                    <span className="tabular-nums text-xs text-rfp-ink-muted">
                      {Math.round(t.pursuedRate * 100)}%
                    </span>
                    <span>{t.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: "var(--rfp-ink-muted)" }}>
                You let go
              </p>
              <ul className="mt-1.5 space-y-1">
                {avoids.length === 0 && <li className="text-sm text-rfp-ink-muted">No clear lean.</li>}
                {avoids.slice(0, 5).map((t) => (
                  <li key={t.label} className="flex items-baseline gap-2 text-sm text-rfp-ink-secondary">
                    <span className="tabular-nums text-xs text-rfp-ink-muted">
                      {Math.round(t.otherRate * 100)}%
                    </span>
                    <span>{t.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-rfp-ink-muted">
            Sent into triage as an observation, never as a rule. If this is wrong, it is because
            the behaviour says so, and the fix is to record your verdict on the bids it has read
            wrong.
          </p>
        </>
      )}
    </div>
  );
}
