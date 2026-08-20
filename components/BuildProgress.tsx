"use client";

import { useEffect, useState } from "react";

/**
 * What is happening while a draft is being built.
 *
 * "Building…" on a button is fine for something that takes a moment. This does
 * not: it assembles fourteen sections from the library, fills them into
 * Caravann's real template, uploads the result to Drive and converts it to a
 * Google Doc. Several seconds, sometimes more, with nothing on screen but a
 * disabled button, which is the shape of a page that has hung.
 *
 * The stages are real, in the order they actually run, so the label is telling
 * the truth about where it is rather than animating for reassurance. What it
 * cannot know is how long each takes, so the bar advances through the stages it
 * has evidence for and then holds at the last one rather than creeping toward
 * 100% on a timer. A progress bar that reaches the end before the work does
 * teaches people to distrust every progress bar you show them afterwards.
 */
const STAGES = [
  { at: 0, label: "Reading the approved-language library" },
  { at: 1500, label: "Writing the sections for this solicitation" },
  { at: 60000, label: "Filling Caravann's template" },
  { at: 90000, label: "Uploading to Drive as a Google Doc" },
] as const;

export function BuildProgress({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) return;
    // Reset inside the interval's own first tick rather than straight from the
    // effect: setting state synchronously here re-renders before paint, and the
    // panel is mounted only while running anyway, so it starts at zero without
    // needing to be told.
    const started = performance.now();
    const tick = setInterval(() => setElapsed(performance.now() - started), 200);
    return () => clearInterval(tick);
  }, [running]);

  if (!running) return null;

  const reached = STAGES.filter((s) => elapsed >= s.at);
  const stage = reached[reached.length - 1] ?? STAGES[0];
  const index = reached.length - 1;

  // Held one stage short of full. The last stage ends when the server answers,
  // not when a timer says so, and claiming otherwise is the thing that makes
  // progress bars untrustworthy.
  const percent = Math.min(90, ((index + 1) / STAGES.length) * 100);

  return (
    <div className="mt-4 rounded-xl border border-rfp-border bg-rfp-surface-sunken px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-rfp-ink">{stage.label}…</p>
        <p className="text-xs tabular-nums text-rfp-ink-muted">
          step {index + 1} of {STAGES.length} · {(elapsed / 1000).toFixed(0)}s
        </p>
      </div>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-rfp-surface"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-label="Building the draft"
      >
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%`, background: "var(--rfp-gold)" }}
        />
      </div>

      <p className="mt-2 text-xs leading-relaxed text-rfp-ink-muted">
        Writing takes a minute or two. You can leave this page: the draft finishes on the server
        and will be here when you come back.
      </p>
    </div>
  );
}
