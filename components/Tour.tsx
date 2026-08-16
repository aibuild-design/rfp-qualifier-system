"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A first-run walkthrough of the desk.
 *
 * Cards alone were not enough: five paragraphs in the middle of the screen
 * describe the desk without ever showing where any of it is, so the reader
 * finishes knowing what the queue does and not which thing is the queue. Every
 * step after the first now cuts a hole in the dimmed page around the rail item
 * it is talking about.
 *
 * The hole is a box-shadow with a 9999px spread rather than a clip-path or four
 * abutting panels: one element, one paint, and it animates between targets
 * without seams appearing at the joins.
 *
 * Falls back to a centred card whenever the target cannot be measured, which is
 * the normal case on a phone where the rail is off-canvas. A spotlight on an
 * element that is not on screen lands on empty space and reads as a bug.
 *
 * Dismissible at every step and remembered, because a tour that reappears is
 * worse than no tour. Stored under its own key rather than alongside the theme
 * so clearing one does not clear the other.
 */
const KEY = "rfp-tour-seen";
const REOPEN = "rfp-tour-reopen";
const PAD = 6;

/** Reopen the tour from anywhere. A tour you cannot get back is a tour you have
 *  to be careful not to dismiss, which is the opposite of the point. */
export function restartTour() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
  window.dispatchEvent(new Event(REOPEN));
}

type Step = {
  /** Matches a `data-tour` attribute in the rail. Absent = centred card. */
  target?: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    title: "This is the bid desk",
    body: "Solicitations arrive by email or you add one by hand. Each is read in full, scored against what Caravann can do, and filed to Drive. About 90 seconds, unattended.",
  },
  {
    target: "add",
    title: "Add one by hand",
    body: "Upload a file, paste the text, or give it a link. For anything that did not arrive by email.",
  },
  {
    target: "overview",
    title: "What needs you today",
    body: "Deadlines inside the week, bids waiting on a decision, and anything still to set up.",
  },
  {
    target: "queue",
    title: "The day's work",
    body: "Every solicitation with its verdict, score, budget and both deadlines. Open one for the reasoning behind it.",
  },
  {
    target: "library",
    title: "Where drafts come from",
    body: "Caravann's own approved language. Proposals are stitched from this, never invented.",
  },
  {
    target: "review",
    title: "Only the unsure ones",
    body: "Bids where the reads disagreed, a requirement was unclear, or the score sat near your threshold.",
  },
  {
    target: "settings",
    title: "What the desk knows",
    body: "Sectors, roster, thresholds. Insurance and set-aside status are still blank, and until they are filled every verdict stays provisional.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

export function Tour() {
  const [step, setStep] = useState<number | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const current = step === null ? null : STEPS[step];

  const measure = useCallback(() => {
    if (!current?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`aside [data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    // Below `lg` the rail is display:none and every rect comes back zeroed, and
    // an off-canvas drawer reports a negative left. Both would spotlight empty
    // space, so both fall back to the centred card.
    if (!r.width || !r.height || r.left < 0) {
      setRect(null);
      return;
    }
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [current]);

  useEffect(() => {
    const open = () => setStep(0);
    window.addEventListener(REOPEN, open);

    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(KEY));
    } catch {
      // Private modes throw. A tour is never worth an error.
    }
    // Deferred rather than set straight from the effect: opening on the first
    // paint and then again on the next is a flash, and reading storage during
    // render would disagree with what the server sent.
    if (!seen) queueMicrotask(open);

    return () => window.removeEventListener(REOPEN, open);
  }, []);

  const close = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* nothing to do */
    }
    setStep(null);
  }, []);

  useEffect(() => {
    if (step === null) return;
    // getBoundingClientRect is a read that can only happen after layout, so it
    // cannot be derived during render. Deferring it to a microtask would paint
    // one frame with the card centred before it jumps to the target.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(s - 1, 0)));
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
    };
  }, [step, measure, close]);

  if (step === null || !current) return null;
  const last = step === STEPS.length - 1;

  const card = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Getting started"
      className="dialog pointer-events-auto w-[21rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-rfp-border bg-rfp-surface p-5 shadow-lg"
    >
      <p className="text-[11px] font-semibold uppercase tracking-widest text-rfp-ink-muted">
        {step + 1} of {STEPS.length}
      </p>
      <h2 className="mt-1.5 font-display text-base font-semibold text-rfp-ink">{current.title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-rfp-ink-secondary">{current.body}</p>

      <div className="mt-5 flex items-center justify-between gap-3">
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
              className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-3.5 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
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

      {/* Progress as dots rather than a bar: few enough to count, and it shows
          how much is left without implying a loading state. */}
      <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
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
  );

  return createPortal(
    <div className="fixed inset-0 z-[60]">
      {/* Clicking the dark area leaves. The card sits above this, so its own
          buttons are not swallowed by it. */}
      <button
        type="button"
        aria-label="Close the tour"
        onClick={close}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      {rect ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-xl"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            // One element for the dimming and the hole both. Four abutting
            // panels show seams at the joins as they animate.
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px var(--rfp-gold-bright)",
            transition:
              "top .3s cubic-bezier(.16,1,.3,1), left .3s cubic-bezier(.16,1,.3,1), width .3s cubic-bezier(.16,1,.3,1), height .3s cubic-bezier(.16,1,.3,1)",
          }}
        />
      ) : (
        <div className="drawer-scrim absolute inset-0 bg-black/60" aria-hidden />
      )}

      <div
        className="pointer-events-none absolute flex"
        style={
          rect
            ? {
                // Clamped so a rail item near the foot of a short window does
                // not push the card off the bottom of the screen.
                top: Math.min(
                  Math.max(rect.top + rect.height / 2 - 90, 12),
                  Math.max((typeof window === "undefined" ? 800 : window.innerHeight) - 320, 12),
                ),
                left: rect.left + rect.width + PAD + 16,
              }
            : { inset: 0, alignItems: "center", justifyContent: "center", padding: 16 }
        }
      >
        {card}
      </div>
    </div>,
    document.body,
  );
}
