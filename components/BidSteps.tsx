/**
 * Where this bid has got to.
 *
 * The page used to present everything at once: the analysis, and underneath it
 * a finished fourteen-section proposal for a bid nobody had decided on yet. So
 * the first thing shown was the last thing that should happen, and the decision
 * it was all for had no particular place on the page.
 *
 * Four steps, in the order they actually occur, with the current one named. The
 * draft step is genuinely blocked rather than merely discouraged: nothing is
 * written until the bid is accepted, so a bid Khaled declines never has a
 * proposal under it.
 */
export type BidStep = {
  label: string;
  detail: string;
  state: "done" | "current" | "blocked";
};

export function bidSteps({
  scored,
  decided,
  declined,
  drafted,
  filed,
}: {
  scored: boolean;
  decided: boolean;
  declined: boolean;
  drafted: boolean;
  filed: boolean;
}): BidStep[] {
  return [
    {
      label: "Read and scored",
      detail: scored ? "The whole document, three times over." : "Waiting on triage.",
      state: scored ? "done" : "current",
    },
    {
      label: "Your decision",
      detail: decided
        ? declined
          ? "You declined this one."
          : "You accepted it."
        : "Nothing else happens until you accept or decline.",
      state: decided ? "done" : scored ? "current" : "blocked",
    },
    {
      label: "Proposal drafted",
      detail: declined
        ? "Not needed. You declined this bid."
        : drafted
          ? "Built from the approved-language library."
          : decided
            ? "Ready to build."
            : "Unlocks once you accept.",
      // A declined bid's remaining steps are settled, not pending. Showing them
      // as blocked would suggest there is still something to do.
      state: declined ? "done" : drafted ? "done" : decided ? "current" : "blocked",
    },
    {
      label: "Filed to Drive",
      detail: filed ? "In the bid folder." : declined ? "Solicitation only." : "After the draft.",
      state: filed ? "done" : drafted ? "current" : "blocked",
    },
  ];
}

export function BidSteps({ steps }: { steps: BidStep[] }) {
  return (
    <section className="mt-6" aria-label="Progress">
      <ol className="grid gap-2 sm:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="rounded-lg border bg-rfp-surface px-3.5 py-3"
            style={{
              borderColor: step.state === "current" ? "var(--rfp-gold)" : "var(--rfp-border)",
              opacity: step.state === "blocked" ? 0.55 : 1,
            }}
          >
            <p className="flex items-baseline gap-2">
              <span
                className="tabular text-[10px] font-semibold uppercase tracking-widest"
                style={{
                  color:
                    step.state === "done"
                      ? "var(--rfp-good)"
                      : step.state === "current"
                        ? "var(--rfp-gold)"
                        : "var(--rfp-ink-muted)",
                }}
              >
                {step.state === "done" ? "✓" : i + 1}
              </span>
              <span className="text-sm font-semibold text-rfp-ink">{step.label}</span>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">{step.detail}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
