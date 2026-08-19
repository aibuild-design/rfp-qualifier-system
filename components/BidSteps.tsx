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
      detail: scored ? "Three reads, reconciled." : "Waiting on triage.",
      state: scored ? "done" : "current",
    },
    {
      label: "Your decision",
      detail: decided
        ? declined
          ? "You declined this one."
          : "You accepted it."
        : "Accept or decline.",
      state: decided ? "done" : scored ? "current" : "blocked",
    },
    {
      label: "Proposal drafted",
      detail: declined
        ? "Not needed. You declined this bid."
        : drafted
          ? "From your own language."
          : decided
            ? "Ready to build."
            : "After you accept.",
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

/**
 * What is still open on this bid.
 *
 * Not a gate, and deliberately not described as one. Every one of these is a
 * judgement Khaled is allowed to skip, and a system that refused to draft until
 * the boxes were ticked would be making his decisions for him.
 *
 * None of these change the draft, and the copy says so rather than implying
 * otherwise. They are work on the bid, tracked here because there is nowhere
 * better to track it. Compliance is the only mandatory one because it is the
 * only one that loses a bid on its own.
 *
 * A Key Personnel section was briefly added so that confirming a person would
 * change the document. It was reverted: the scope is fourteen sections matching
 * the fourteen headings in Caravann's template, and a fifteenth is dropped on
 * the way into the .docx because there is no heading to write it under.
 *
 * Only shown once the bid is accepted. Before that the answer to all of it is
 * "not yet", which is noise.
 */
export function ReadyToDraft({
  openQuestions,
  unconfirmedTeam,
  openCompliance,
}: {
  openQuestions: number;
  unconfirmedTeam: number;
  openCompliance: number;
}) {
  // Mandatory and optional are not decoration. Compliance is the only one that
  // loses a bid on its own: a missed page limit or a wrong submission method
  // gets a good proposal thrown out unopened. Questions and team are judgement,
  // and plenty of bids go out without asking anything.
  const rows = [
    {
      label: "Compliance worked through",
      mandatory: true,
      done: openCompliance === 0,
      detail:
        openCompliance === 0
          ? "Every item ticked."
          : `${openCompliance} item${openCompliance === 1 ? "" : "s"} not ticked yet.`,
    },
    {
      label: "Questions decided",
      mandatory: false,
      done: openQuestions === 0,
      detail:
        openQuestions === 0
          ? "Every question is approved or turned down."
          : `${openQuestions} still waiting on approve or not asking.`,
    },
    {
      label: "Team confirmed",
      // Optional, because confirming was scoped as the assignment record rather
      // than as proposal input, and the draft does not read it. Calling it
      // mandatory would be asking for work with no consequence, which is how a
      // checklist teaches people to ignore it.
      mandatory: false,
      done: unconfirmedTeam === 0,
      detail:
        unconfirmedTeam === 0
          ? "Nobody is left as a suggestion."
          : `${unconfirmedTeam} still a suggestion. Confirming records who is on the bid; it does not change the draft.`,
    },
  ];
  const open = rows.filter((r) => !r.done).length;

  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Before you draft</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
        {open === 0
          ? "Nothing outstanding on this bid."
          : "Nothing here blocks drafting, and none of it changes what the draft says. Compliance is mandatory because it is the one that loses bids on a technicality."}
      </p>
      <ul className="mt-3 divide-y divide-rfp-border overflow-hidden rounded-xl border border-rfp-border bg-rfp-surface">
        {rows.map((row) => (
          <li key={row.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-3">
            <span
              aria-hidden
              className="text-xs font-semibold"
              style={{ color: row.done ? "var(--rfp-good)" : "var(--rfp-warning)" }}
            >
              {row.done ? "\u2713" : "\u25cb"}
            </span>
            <span className="text-sm font-medium text-rfp-ink">{row.label}</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
              style={{
                color: row.mandatory ? "var(--rfp-warning)" : "var(--rfp-ink-muted)",
                background: "var(--rfp-surface-sunken)",
              }}
            >
              {row.mandatory ? "Mandatory" : "Optional"}
            </span>
            <span className="text-xs text-rfp-ink-muted">{row.detail}</span>
          </li>
        ))}
      </ul>

    </section>
  );
}
