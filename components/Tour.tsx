"use client";

import { useEffect, useState } from "react";

/**
 * A first-run walkthrough of the desk.
 *
 * Five cards, shown once. Not a tooltip that chases elements around the screen:
 * those break the moment a layout changes, and this one has to survive a queue
 * that is empty on the day someone first opens it, which is exactly when a tour
 * matters and exactly when there is nothing to point at.
 *
 * Dismissible at every step and remembered, because a tour that reappears is
 * worse than no tour. Stored under its own key rather than alongside the theme
 * so clearing one does not clear the other.
 */
const KEY = "rfp-tour-seen";

const STEPS = [
  {
    title: "This is the bid desk",
    body: "Solicitations arrive by email or you add one by hand. Each gets read in full, scored against what Caravann can actually do, and filed to Drive. It takes about 90 seconds and nobody has to be watching.",
  },
  {
    title: "The queue is the day's work",
    body: "Every solicitation with its verdict, score, budget and both deadlines. Go means worth bidding, maybe means something is unresolved, no-go means ruled out. Sort by deadline whenever a due date matters more than fit.",
  },
  {
    title: "Open one to see the reasoning",
    body: "Each stated requirement marked pass, fail or unclear. The compliance checklist, the gaps, drafted questions for the agency, a suggested team and a 14-section proposal draft, all built before you arrive.",
  },
  {
    title: "Nothing happens without you",
    body: "The desk suggests. It never confirms a person onto a bid, approves a section, changes its own rules, or submits anything. Those stay yours, and every one is recorded against your name.",
  },
  {
    title: "Two things to fill in",
    body: "Settings holds what Caravann is: sectors, roster, approved language. Insurance and set-aside status are blank, and until they are filled any solicitation naming an insurance minimum stalls at maybe.",
  },
];

export function Tour() {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setStep(0);
    } catch {
      // Private modes throw. A tour is never worth an error.
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* nothing to do */
    }
    setStep(null);
  }

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(s - 1, 0)));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  if (step === null) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close the tour"
        onClick={close}
        className="drawer-scrim absolute inset-0 h-full w-full cursor-default bg-black/60"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Getting started"
        className="dialog relative w-full max-w-md rounded-2xl border border-rfp-border bg-rfp-surface p-6 shadow-lg"
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
          {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-2 font-display text-lg font-semibold text-rfp-ink">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-rfp-ink-secondary">{current.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={close}
            className="press min-h-11 text-sm font-medium text-rfp-ink-muted hover:text-rfp-ink"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? close() : setStep(step + 1))}
              className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90"
            >
              {last ? "Start using it" : "Next"}
            </button>
          </div>
        </div>

        {/* Progress as dots rather than a bar: five is few enough to count, and
            it shows how much is left without implying a loading state. */}
        <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === step ? "w-5 bg-rfp-ink" : "w-1.5 bg-rfp-border-strong"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
