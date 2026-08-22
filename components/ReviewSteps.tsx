"use client";

import { useState, type ReactNode } from "react";

/**
 * The weekly pass, one step at a time.
 *
 * Module 11 describes this as something to "clear in a sitting", and it was a
 * single column carrying four unrelated jobs: how the desk is scoring against
 * Khaled, cases it could not settle, portal quirks it has been taught, and a
 * log of what was already dealt with. Stacked, the second and third read as
 * more of the first, and the only way to know whether anything needed doing was
 * to scroll the whole thing.
 *
 * Four steps, each with its own heading, its own explanation of what it is for,
 * and a count on the tab so you can see from the first screen whether there is
 * anything here at all.
 *
 * Client state rather than a URL parameter. Approving an edge case is an
 * optimistic update inside the step, and a step change that remounted the tree
 * would throw that away mid-sitting.
 */

export type ReviewStep = {
  key: string;
  /** Short, for the tab. */
  tab: string;
  /** The question this step answers, as a heading. */
  title: string;
  /** What this step is for, in one line. */
  lede: string;
  /** How many things are here, shown on the tab. Undefined shows no badge. */
  count?: number;
  /** Whether the count means "you have work", which colours the badge. */
  needsYou?: boolean;
  body: ReactNode;
};

export function ReviewSteps({ steps }: { steps: ReviewStep[] }) {
  const [at, setAt] = useState(0);
  const step = steps[at];
  const last = steps.length - 1;

  return (
    <div>
      <nav aria-label="Review steps" className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => {
          const here = i === at;
          return (
            <button
              key={s.key}
              onClick={() => setAt(i)}
              aria-current={here ? "step" : undefined}
              className={`press inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                here
                  ? "border-rfp-ink bg-rfp-ink text-rfp-surface"
                  : "border-rfp-border text-rfp-ink-secondary hover:bg-rfp-surface-sunken"
              }`}
            >
              <span className="tabular text-[11px] opacity-60">{i + 1}</span>
              {s.tab}
              {s.count !== undefined && s.count > 0 && (
                <span
                  className="tabular rounded-full px-1.5 text-[11px] font-semibold"
                  style={
                    here
                      ? { background: "color-mix(in srgb, currentColor 22%, transparent)" }
                      : s.needsYou
                        ? { background: "var(--rfp-warn-wash, #f6ebd6)", color: "var(--rfp-warn, #8a5a05)" }
                        : { background: "var(--rfp-surface-sunken)", color: "var(--rfp-ink-muted)" }
                  }
                >
                  {s.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-6">
        <h2 className="font-display text-lg font-semibold text-rfp-ink">{step.title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-rfp-ink-secondary">{step.lede}</p>
        <div className="mt-4">{step.body}</div>
      </div>

      <nav
        aria-label="Move between steps"
        className="mt-8 flex items-center justify-between border-t border-rfp-border pt-4"
      >
        <button
          onClick={() => setAt(at - 1)}
          disabled={at === 0}
          className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-4 text-sm font-medium text-rfp-ink-secondary hover:bg-rfp-surface-sunken disabled:pointer-events-none disabled:opacity-40"
        >
          Back
        </button>
        <span className="tabular text-xs text-rfp-ink-muted">
          Step {at + 1} of {steps.length}
        </span>
        <button
          onClick={() => setAt(at + 1)}
          disabled={at === last}
          className="press inline-flex min-h-11 items-center rounded-lg bg-rfp-ink px-4 text-sm font-semibold text-rfp-surface hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
        >
          {at === last ? "Done" : "Next"}
        </button>
      </nav>
    </div>
  );
}

/**
 * Pages a long list inside a step.
 *
 * Twenty-two portal rules is a scroll, not a review. Absent entirely below the
 * page size, for the same reason the queue pager is: a control reading "1 of 1"
 * is furniture, and furniture stops being noticed on the day it matters.
 */
export function Paged<T>({
  items,
  perPage = 6,
  noun,
  render,
}: {
  items: T[];
  perPage?: number;
  /** Plural, for the count line. */
  noun: string;
  render: (page: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(items.length / perPage);
  const from = page * perPage;
  const slice = items.slice(from, from + perPage);

  if (pageCount <= 1) return <>{render(items)}</>;

  return (
    <div>
      {render(slice)}
      <nav
        aria-label={`${noun} pages`}
        className="mt-3 flex flex-wrap items-center gap-2 text-sm text-rfp-ink-secondary"
      >
        <span className="tabular mr-1 text-xs">
          {from + 1} to {Math.min(from + perPage, items.length)} of {items.length} {noun}
        </span>
        <button
          onClick={() => setPage(page - 1)}
          disabled={page === 0}
          className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-3 font-medium hover:bg-rfp-surface-sunken disabled:pointer-events-none disabled:opacity-40"
        >
          Previous
        </button>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= pageCount - 1}
          className="press inline-flex min-h-11 items-center rounded-lg border border-rfp-border px-3 font-medium hover:bg-rfp-surface-sunken disabled:pointer-events-none disabled:opacity-40"
        >
          Next
        </button>
      </nav>
    </div>
  );
}
