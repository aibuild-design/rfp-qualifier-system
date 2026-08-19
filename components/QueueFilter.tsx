import Link from "next/link";

/**
 * One row that filters the queue by verdict.
 *
 * This replaces four stat cards and a separate "View no-go folder" button.
 * Between them those did the same job in two visual languages: the cards were
 * filters shaped like statistics, the button was a filter shaped like an
 * action, and one card was not a filter at all but a sort, styled identically
 * to the four that were.
 *
 * The counts they showed are the Overview's job, and the Overview already does
 * it under "The desk so far". Two copies of the same four numbers, one screen
 * apart, is a maintenance problem waiting to disagree with itself.
 *
 * Maybe and no-go now filter too, which the cards never offered. Fewer pixels,
 * more of the thing they were for.
 *
 * Drawn as one joined control rather than separate chips, because the folder
 * bar directly above it is separate chips. Built the same way, the two rows sat
 * on top of each other both starting with "All", filtering different things,
 * looking identical. One segmented control against spaced chips says these are
 * two kinds of thing without a word of explanation.
 */
export function QueueFilter({
  counts,
  active,
  sortByDeadline,
}: {
  counts: { all: number; go: number; maybe: number; no_go: number; pending: number };
  active: string | null;
  sortByDeadline: boolean;
}) {
  const sort = sortByDeadline ? "sort=deadline" : "";
  const href = (view: string | null) =>
    `/dashboard${[view ? `view=${view}` : "", sort].filter(Boolean).length ? "?" : ""}${[view ? `view=${view}` : "", sort].filter(Boolean).join("&")}`;

  const options: { key: string | null; label: string; n: number; tone?: string }[] = [
    { key: null, label: "All", n: counts.all },
    { key: "go", label: "Go", n: counts.go, tone: "var(--rfp-good)" },
    { key: "maybe", label: "Maybe", n: counts.maybe, tone: "var(--rfp-warning)" },
    { key: "no-go", label: "No-go", n: counts.no_go, tone: "var(--rfp-critical)" },
    { key: "pending", label: "Being read", n: counts.pending },
  ];

  return (
    <div className="mt-3 inline-flex flex-wrap overflow-hidden rounded-lg border border-rfp-border bg-rfp-surface">
      {options.map((o, i) => {
        const on = (o.key ?? null) === active;
        return (
          <Link
            key={o.label}
            href={href(o.key)}
            aria-current={on ? "true" : undefined}
            className={`press inline-flex min-h-11 items-center gap-1.5 px-3.5 text-[13px] font-medium ${
              i > 0 ? "border-l border-rfp-border" : ""
            } ${on ? "bg-rfp-ink text-rfp-surface" : "text-rfp-ink-secondary hover:bg-rfp-surface-sunken"}`}
          >
            {o.tone && !on && (
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: o.tone }} />
            )}
            {o.label}
            <span className={`tabular-nums text-xs ${on ? "opacity-70" : "text-rfp-ink-muted"}`}>
              {o.n}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
