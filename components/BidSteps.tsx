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

/**
 * What is still open on this bid.
 *
 * Not a gate, and deliberately not described as one. Every one of these is a
 * judgement Khaled is allowed to skip, and a system that refused to draft until
 * the boxes were ticked would be making his decisions for him.
 *
 * It also does not claim to change the draft, because it does not. buildDraft
 * reads the solicitation row and the language library and nothing else: no
 * team, no questions, no compliance. An earlier version of this copy said the
 * draft "will not know about" unticked items, which was simply untrue - it
 * knows about them either way, which is to say not at all.
 *
 * That the confirmed team does not reach the proposal is a real gap rather
 * than a design choice, and it is named on screen rather than papered over.
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
      mandatory: false,
      done: unconfirmedTeam === 0,
      detail:
        unconfirmedTeam === 0
          ? "Nobody is left as a suggestion."
          : `${unconfirmedTeam} suggested, none confirmed yet.`,
    },
  ];
  const openMandatory = rows.filter((r) => r.mandatory && !r.done).length;
  const open = rows.filter((r) => !r.done).length;

  return (
    <section className="mt-8">
      <h2 className="font-display text-sm font-semibold text-rfp-ink">Before you draft</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-rfp-ink-muted">
        {open === 0
          ? "Nothing outstanding on this bid."
          : openMandatory > 0
            ? "None of this blocks drafting, and none of it changes what the draft says. The mandatory line is the one that loses bids on a technicality."
            : "None of this blocks drafting, and none of it changes what the draft says. These are judgement calls, and plenty of bids go out without them."}
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
      {unconfirmedTeam >= 0 && (
        <p className="mt-2 text-xs leading-relaxed text-rfp-ink-muted">
          Worth knowing: the draft is built from the solicitation and the approved-language
          library only. Confirmed people do not yet appear in it, so key personnel still has to be
          written in by hand.
        </p>
      )}
    </section>
  );
}
