import {
  COST_PER_SOLICITATION,
  GAUGE_CEILING,
  TOP_UP_URL,
  WARN_BELOW,
  type Credit,
} from "@/lib/openrouter-credit";

/**
 * What is left on OpenRouter, as a gauge rather than a sentence.
 *
 * A line of text saying "$9.09 of $50.00" is read as two numbers and forgotten.
 * A bar that is nearly empty is understood before it is read, which matters
 * here because running dry does not announce itself: triage simply stops
 * returning verdicts and the week looks quiet.
 *
 * The headline is dollars, because dollars are the only exact figure here. The
 * solicitation count is division by an average and a long RFP costs more than
 * an average one, so it is written as an estimate and kept in the secondary
 * line. A number set in 30px is read as a fact whatever the caption says.
 *
 * Bar, notch and colour are all keyed off the same dollars for the same reason:
 * an earlier version measured the bar in one unit and picked the colour in
 * another, and put a green label above a bar that looked nearly empty.
 *
 * The lifetime total is not shown at all. It only ever grows, so "$9.09 of
 * $50.00" becomes "$9.09 of $200.00" for identical runway, and reading the
 * second as five times worse than the first is the natural mistake.
 */
export function CreditMeter({ credit }: { credit: Credit }) {
  // Against a fixed ceiling, so a given height always means the same runway.
  const pct = Math.max(0, Math.min(100, (credit.remaining / GAUGE_CEILING) * 100));

  // Where the warning starts, read from the same constant the colour is picked
  // from, so the notch cannot disagree with the bar beside it.
  const lowAt = (WARN_BELOW / GAUGE_CEILING) * 100;

  const tone =
    credit.level === "ok"
      ? "var(--rfp-good)"
      : credit.level === "low"
        ? "var(--rfp-warning)"
        : "var(--rfp-critical)";


  const message =
    credit.level === "empty"
      ? "Out of credit. The next solicitation will arrive with no verdict."
      : credit.level === "low"
        ? "Running low. Top up before it stops returning verdicts."
        : null;

  return (
    <div
      className="mt-3 rounded-xl border bg-rfp-surface px-5 py-4"
      style={{
        borderColor: credit.level === "ok" ? "var(--rfp-border)" : tone,
        background:
          credit.level === "empty"
            ? "color-mix(in srgb, var(--rfp-critical) 6%, var(--rfp-surface))"
            : undefined,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-rfp-ink-muted">
          OpenRouter credit
        </h3>
        <p className="text-xs text-rfp-ink-muted">
          about <span className="tabular-nums">${COST_PER_SOLICITATION.toFixed(2)}</span> a
          solicitation
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        {/* Tabular figures: this changes on every load, and proportional digits
            make the line jump sideways when it does. */}
        <span className="font-display text-3xl font-semibold tabular-nums leading-none" style={{ color: tone }}>
          ${credit.remaining.toFixed(2)}
        </span>
        <span className="text-sm font-medium text-rfp-ink">left</span>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-rfp-surface-sunken">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: tone }}
          role="meter"
          aria-valuenow={Number(credit.remaining.toFixed(2))}
          aria-valuemin={0}
          aria-valuemax={GAUGE_CEILING}
          aria-label="OpenRouter credit remaining"
        />
        {/* A gap punched through the fill rather than a line drawn over it. A
            grey line on a coloured bar disappears at exactly the moment it
            matters, which is when the fill has reached it. Hidden when it would
            sit on the very edge and imply the threshold is at the top or bottom
            of the tank. */}
        {lowAt > 1.5 && lowAt < 98.5 && (
          <span
            className="absolute top-0 h-full w-0.5 bg-rfp-page"
            style={{ left: `${lowAt}%` }}
            aria-hidden
          />
        )}
      </div>

      {lowAt > 1.5 && lowAt < 98.5 && (
        // The threshold labelled under the track. A warning that appears without
        // saying where the line was drawn reads as arbitrary, and the first
        // question anyone asks a warning is "says who".
        <div className="relative mt-1 h-3.5" aria-hidden>
          <span
            className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-rfp-ink-muted"
            style={{ left: `${lowAt}%` }}
          >
            warns below ${WARN_BELOW.toFixed(2)}
          </span>
        </div>
      )}

      {/* Deliberately an estimate, and deliberately not the headline. It is
          division by an average, and a long solicitation costs more than an
          average one. */}
      <p className="mt-1.5 text-xs leading-relaxed text-rfp-ink-muted">
        {credit.solicitationsLeft === 0 ? (
          <>Not enough for another one at that average, which was measured across real runs.</>
        ) : (
          <>
            Roughly {credit.solicitationsLeft} more{" "}
            {credit.solicitationsLeft === 1 ? "solicitation" : "solicitations"} at that average,
            which was measured across real runs. Long documents cost more, so treat it as a guide
            rather than a count.
          </>
        )}{" "}
        The bar fills at ${GAUGE_CEILING.toFixed(2)} and stays on that scale however much you add.
      </p>

      {message && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-rfp-border pt-3">
          <p className="text-xs font-medium leading-relaxed" style={{ color: tone }}>
            {message}
          </p>
          {/* The warning and the fix in one place. Being told the tank is empty
              and then having to go and find the pump is how a warning gets read
              and not acted on. */}
          <a
            href={TOP_UP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex min-h-11 shrink-0 items-center rounded-lg bg-rfp-ink px-4 text-xs font-semibold text-rfp-surface hover:opacity-90"
          >
            Add credit on OpenRouter &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
