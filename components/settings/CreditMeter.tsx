import {
  COST_PER_SOLICITATION,
  GAUGE_FULL_SOLICITATIONS,
  LOW_AT_SOLICITATIONS,
  TOP_UP_URL,
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
 * The bar carries the low-credit threshold as a visible notch. A warning that
 * appears without saying where the line was drawn reads as arbitrary, and the
 * first question anyone asks a warning is "says who".
 */
export function CreditMeter({ credit }: { credit: Credit }) {
  // Measured in solicitations, the same unit the colour is decided in, so the
  // bar and the label can never tell two different stories.
  const pct = Math.max(0, Math.min(100, (credit.solicitationsLeft / GAUGE_FULL_SOLICITATIONS) * 100));
  const lowAt = (LOW_AT_SOLICITATIONS / GAUGE_FULL_SOLICITATIONS) * 100;

  const tone =
    credit.level === "ok"
      ? "var(--rfp-good)"
      : credit.level === "low"
        ? "var(--rfp-warning)"
        : "var(--rfp-critical)";

  const message =
    credit.level === "empty"
      ? "Out of credit. The next solicitation will arrive with no verdict."
      : credit.level === "critical"
        ? "Nearly out. When it runs dry, triage stops and solicitations arrive with no verdict."
        : credit.level === "low"
          ? "Getting low. Top up before it stops returning verdicts."
          : null;

  return (
    <div
      className="mt-3 rounded-xl border bg-rfp-surface px-5 py-4"
      style={{
        borderColor: credit.level === "ok" ? "var(--rfp-border)" : tone,
        background:
          credit.level === "critical" || credit.level === "empty"
            ? "color-mix(in srgb, var(--rfp-critical) 6%, var(--rfp-surface))"
            : undefined,
      }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-rfp-ink-muted">
          OpenRouter credit
        </h3>
        <p className="text-xs text-rfp-ink-muted">
          {/* Tabular figures: this number changes on every load, and proportional
              digits make the line jump sideways when it does. */}
          <span className="tabular-nums">${credit.used.toFixed(2)}</span> spent of{" "}
          <span className="tabular-nums">${credit.total.toFixed(2)}</span>
        </p>
      </div>

      {/* The headline is solicitations, not dollars. "About fifty more bids" is
          a number someone can act on. "$9.09" needs arithmetic first. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="font-display text-3xl font-semibold tabular-nums leading-none" style={{ color: tone }}>
          {credit.solicitationsLeft}
        </span>
        <span className="text-sm font-medium text-rfp-ink">
          {credit.solicitationsLeft === 1 ? "solicitation left" : "solicitations left"}
        </span>
        <span className="text-sm text-rfp-ink-muted tabular-nums">
          &middot; ${credit.remaining.toFixed(2)}
        </span>
        <span className="ml-auto text-xs text-rfp-ink-muted">
          gauge reads out of {GAUGE_FULL_SOLICITATIONS}
        </span>
      </div>

      <div
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-rfp-surface-sunken"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`OpenRouter credit remaining, about ${credit.solicitationsLeft} solicitations`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: tone }}
        />
        {/* A gap punched through the fill rather than a line drawn over it. A
            grey line on a coloured bar disappears at exactly the moment it
            matters, which is when the fill has reached it. */}
        <span
          className="absolute top-0 h-full w-0.5 bg-rfp-page"
          style={{ left: `${lowAt}%` }}
          aria-hidden
        />
      </div>

      {/* The threshold labelled under the track. A warning that appears without
          saying where the line was drawn reads as arbitrary, and the first
          question anyone asks a warning is "says who". */}
      <div className="relative mt-1 h-3.5" aria-hidden>
        <span
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tabular-nums text-rfp-ink-muted"
          style={{ left: `${lowAt}%` }}
        >
          {LOW_AT_SOLICITATIONS} left
        </span>
      </div>

      <p className="mt-0.5 text-xs text-rfp-ink-muted">
        About ${COST_PER_SOLICITATION.toFixed(2)} a solicitation, measured across real runs. Below
        that mark it starts warning you.
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
