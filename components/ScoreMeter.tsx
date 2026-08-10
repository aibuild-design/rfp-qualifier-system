import { VERDICT_META } from "@/lib/rfp";
import type { RfpStatus } from "@/lib/supabase/types";

/**
 * The score as a bar, with the go line marked on it.
 *
 * "84%" tells you a number. It does not tell you that the go line is at 85 and
 * this missed it by one, which is the thing that decides whether a week gets
 * spent. The tick makes the near-misses visible at a glance, and near-misses
 * are exactly the rows worth a second look.
 *
 * Coloured by the verdict rather than by the score, so the bar never disagrees
 * with the badge beside it. A high score that failed a mandatory requirement is
 * a red bar at 92%, which is the honest picture: it scored well and it is still
 * closed.
 *
 * Fills from zero on load via a CSS transition on transform, so nothing is
 * animating layout. Under reduced motion the global rule pins the transform and
 * it simply appears at its final width.
 */
export function ScoreMeter({
  score,
  status,
  goThreshold = 85,
  className,
}: {
  score: number | null;
  status: RfpStatus;
  goThreshold?: number;
  className?: string;
}) {
  if (score === null) {
    return <span className={`text-sm text-rfp-ink-muted ${className ?? ""}`}>&mdash;</span>;
  }

  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const colour = VERDICT_META[status]?.color ?? "var(--rfp-neutral)";

  return (
    <span className={`inline-flex min-w-0 flex-col gap-1 ${className ?? ""}`}>
      <span className="tabular text-sm font-semibold text-rfp-ink">{pct}%</span>
      <span
        className="score-track relative block h-1 w-16 overflow-hidden rounded-full bg-rfp-surface-sunken"
        role="img"
        aria-label={`${pct} percent, ${VERDICT_META[status]?.label ?? status}. Go line at ${goThreshold} percent.`}
      >
        <span
          className="score-fill absolute inset-y-0 left-0 block w-full rounded-full"
          style={{ background: colour, transform: `scaleX(${pct / 100})` }}
        />
        {/* The bar means little without knowing where the line is. */}
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-rfp-ink/35"
          style={{ left: `${goThreshold}%` }}
        />
      </span>
    </span>
  );
}
