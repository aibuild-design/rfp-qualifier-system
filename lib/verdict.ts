/**
 * Turns a score and a set of gate checks into go / maybe / no-go.
 *
 * The model used to choose the label itself, and it was not reproducible: the
 * same solicitation, run three times at temperature 0, came back
 * `maybe / 83`, `go / 87`, `go / 88`. The underlying read barely moved - the
 * model just picked a different side of a boundary it invented on the spot.
 * On a desk where the label decides whether a week gets spent, a verdict that
 * changes between runs is not a verdict.
 *
 * So the model now reports what it found - a score, and pass/fail per
 * requirement - and the label is arithmetic. Same input, same answer, every
 * time. And the boundary becomes Khaled's to set rather than something to
 * argue with a model about.
 */

export type VerdictStatus = "go" | "maybe" | "no_go" | "pending";

/** Only the fields the decision actually reads. */
export type GateCheck = {
  is_required?: boolean | null;
  is_hard_knockout?: boolean | null;
  result?: string | null;
  requirement_text?: string | null;
};

export type Thresholds = {
  go: number;
  maybe: number;
  /** How far the individual reads may disagree before the desk stops claiming
   *  confidence. Beyond this the verdict is capped at "maybe". */
  maxSpread?: number;
  /** When true, a missed *preferred* requirement also closes the bid. Off by
   *  default - the SOW is explicit that preferred lowers the score rather than
   *  killing it, and turning it on will rule out winnable work. */
  preferredIsFatal?: boolean;
  /** Subjects Khaled has marked as genuine dealbreakers, from Settings. */
  knockouts?: readonly Knockout[];
};

/** One of Khaled's own dealbreakers: a subject that closes a bid outright. */
export type Knockout = { term: string; reason: string | null };

/** The shape the settings row arrives in, mapped to what the decision reads.
 *  Falls back to the defaults if the row is missing, so a fresh database or a
 *  failed read degrades to sane behaviour rather than to no verdicts at all. */
export function thresholdsFromSettings(
  row:
    | {
        go_threshold?: number | null;
        maybe_threshold?: number | null;
        preferred_misses_are_fatal?: boolean | null;
        max_score_spread?: number | null;
      }
    | null
    | undefined,
  knockouts: readonly Knockout[] = []
): Thresholds {
  return {
    go: row?.go_threshold ?? THRESHOLDS.go,
    maybe: row?.maybe_threshold ?? THRESHOLDS.maybe,
    preferredIsFatal: row?.preferred_misses_are_fatal ?? false,
    maxSpread: row?.max_score_spread ?? DEFAULT_MAX_SPREAD,
    knockouts,
  };
}

/** Default disagreement tolerance. Twenty points is wide enough that ordinary
 *  model wobble passes, and narrow enough to catch the 55-among-90s case. */
export const DEFAULT_MAX_SPREAD = 20;

/** How far apart the furthest two reads were. Useful to display; a poor basis
 *  for a decision - see consensusGap. */
export function spreadOf(samples: readonly number[] | null | undefined): number {
  if (!samples || samples.length < 2) return 0;
  return Math.max(...samples) - Math.min(...samples);
}

/**
 * The tightest agreement any two reads reached.
 *
 * Total spread is the wrong test with three samples. A real run returned
 * 58, 87 and 88: the spread is 30, but two reads agree to within a point and
 * the third is simply a bad read that the median already discards. Calling
 * that "uncertain" would push a clear go into maybe every time the model has
 * an off run - which is often.
 *
 * What actually signals uncertainty is *no two reads agreeing at all*:
 * 30, 60, 90 has the same shape as 58, 87, 88 by spread, but nothing to stand
 * on. So the test is the smallest gap between neighbouring reads.
 */
export function consensusGap(samples: readonly number[] | null | undefined): number {
  if (!samples || samples.length < 2) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  let smallest = Infinity;
  for (let i = 1; i < sorted.length; i++) smallest = Math.min(smallest, sorted[i] - sorted[i - 1]);
  return smallest;
}

/**
 * Defaults until Caravann sets its own. Overridable per deployment so the
 * boundary can be tuned without a code change - the whole point of moving it
 * out of the model is that it becomes a dial someone can turn.
 */
export const THRESHOLDS: Thresholds = {
  go: numberFromEnv("VERDICT_GO_THRESHOLD", 85),
  maybe: numberFromEnv("VERDICT_MAYBE_THRESHOLD", 60),
};

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * The short list of things that get a proposal rejected before anyone reads it.
 *
 * Public procurement keeps two ideas apart and this desk had merged them.
 *
 * **Responsiveness** is whether the submission is valid: filed on time, through
 * the right channel, with the required forms, signatures and any certification
 * the agency demands you already hold. Miss one and the proposal is returned
 * unopened. Leesburg RFP 100120-FY27-09 spells out its entire rejection list
 * and every item is this: late, wrong channel, partially uploaded.
 *
 * **Evaluation** is whether you are any good. The same RFP scores Firm
 * Experience at 30%, Key Personnel at 30%, Approach at 20%, Price at 20%.
 * Nothing there rejects anybody. It costs points.
 *
 * The gate used to read "Must have significant experience... in the
 * Commonwealth of Virginia", see the word must, and close the bid. Khaled would
 * bid it - he likes all seven of the solicitations that produced this rule, and
 * the desk would have told him no on work he actively wants. A desk that
 * silently narrows the pipeline it exists to widen is worse than no desk,
 * because nobody sees what it discarded.
 *
 * So the default inverted. Nothing blocks unless it is named here or Khaled
 * marked it a dealbreaker himself. Insurance, registrations and references are
 * absent on purpose: they are conditions of award, they live on the compliance
 * checklist in module 6, and the agencies say so themselves - Clackamas, asked
 * directly, answered that "insurance requirements will be finalized during
 * contract negotiations" and the business registry is "a requirement at time of
 * contract execution".
 *
 * Experience is absent too. It is the score's job.
 */
const NON_RESPONSIVE =
  /\bbond(ed|ing|s)?\b|surety|debarr?ed|suspended from (bidding|contracting)|set[- ]aside|\b(dbe|mbe|wbe|sbe|8\(a\))\b|prequalif|must (already )?be certified/i;

export type Decision = {
  status: VerdictStatus;
  /** Plain-language account of which rule fired, shown in the UI and the log. */
  reason: string;
};

/**
 * A failed requirement outranks any score. A solicitation demanding three years
 * of behavioral health experience is not a 40% fit for a firm with none - it is
 * closed, and no amount of overlap elsewhere reopens it.
 */
export function decideVerdict(
  scorePercent: number | null | undefined,
  checks: readonly GateCheck[] = [],
  thresholds: Thresholds = THRESHOLDS,
  /** Every score the triage runs returned. When they disagree badly, the
   *  honest verdict is "look at this yourself" rather than a confident call. */
  samples: readonly number[] | null = null,
  /** The submission deadline, when the document stated one. */
  dueAt: string | null = null,
  /** Injected so this stays a pure function and can be tested against a fixed
   *  clock rather than whenever the suite happens to run. */
  now: Date = new Date()
): Decision {
  // A closed solicitation is closed. This is arithmetic, not judgement, so it
  // is decided here rather than asked of the model.
  //
  // It was asked of the model, and the model had no clock. A real Central
  // Health posting that closed the previous day came back scored as having
  // "roughly two weeks to prepare a proposal", because nothing in the prompt
  // said what day it was. Runway was being judged against nothing at all.
  if (dueAt) {
    const due = new Date(dueAt);
    if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) {
      return {
        status: "no_go",
        reason: `The submission deadline passed on ${due.toISOString().slice(0, 10)}. Nothing else about the bid can change that.`,
      };
    }
  }

  // Khaled's own dealbreakers, checked before anything else scores.
  //
  // Module 2 asks for specific items to be markable as hard knockouts, "the
  // ones your history says are real dealbreakers, behavioral health for
  // instance". The only control that existed was a single switch making every
  // preferred miss fatal, which could not express that: behavioral health
  // could not be a dealbreaker unless a preferred font size became one too.
  //
  // Applies to unclear as well as fail. If a subject is genuinely fatal for
  // this firm, "the profile does not say" is not a reason to spend a week on
  // the bid; it is a reason to ask him and record the answer once.
  const knocked = checks.find(
    (c) =>
      c.result !== "pass" &&
      c.result !== "not_applicable" &&
      thresholds.knockouts?.some((k) => new RegExp(k.term, "i").test(c.requirement_text ?? "")),
  );
  if (knocked) {
    const rule = thresholds.knockouts?.find((k) =>
      new RegExp(k.term, "i").test(knocked.requirement_text ?? ""),
    );
    return {
      status: "no_go",
      reason: `You marked "${rule?.term}" as a dealbreaker${rule?.reason ? `: ${rule.reason}` : ""}. This solicitation requires it${knocked.result === "unclear" ? " and the profile does not say whether Caravann meets it" : ""}.`,
    };
  }

  // Only a genuinely non-responsive failure closes a bid.
  //
  // Everything else - a thin sector, a missing registration, an insurance limit
  // below the stated minimum - is either scored or tracked as a task. Both are
  // already visible: gaps on the bid page, obligations on the compliance
  // checklist. Closing the bid as well counted the same fact twice and answered
  // a question the agency had not asked.
  // Two ways in, and both mean the same thing: the solicitation itself says
  // this one is disqualifying.
  //
  // `is_hard_knockout` is triage's reading of the document - a requirement
  // sitting under "Minimum Qualifications" beside language like "proposals not
  // meeting these will be deemed non-responsive". That is the behavioural
  // health case the product was built for and it still closes a bid.
  //
  // The pattern is a safety net under it, for the handful of things that are
  // disqualifying wherever they appear and that no reading should miss: a bond
  // Caravann cannot post, a set-aside it does not hold, debarment.
  //
  // What is deliberately not here is `is_required` on its own. Every "must" in
  // a statement of needs was being treated as a gate, and most of them are
  // scored: Leesburg asks for Virginia experience under a heading that says
  // must, then weights Firm Experience at 30% and rejects nobody for it.
  const blocking = checks.filter(
    (c) =>
      (c.result === "fail" || c.result === "unclear") &&
      (c.is_hard_knockout === true || NON_RESPONSIVE.test(c.requirement_text ?? "")),
  );
  if (blocking.length > 0) {
    const first = blocking[0].requirement_text?.trim();
    return {
      status: "no_go",
      reason: `Cannot submit a responsive proposal: ${blocking.length} requirement${blocking.length > 1 ? "s" : ""} would have it rejected unopened${
        first ? `, starting with: ${truncate(first, 110)}` : ""
      }.`,
    };
  }

  // No score means triage has not finished, not that the answer is no.
  if (scorePercent === null || scorePercent === undefined || !Number.isFinite(scorePercent)) {
    return { status: "pending", reason: "No score yet - triage has not returned." };
  }

  // A requirement the profile is silent on is not a requirement Caravann
  // fails. It used to be treated as one, because "fail" was the only answer
  // available for "the profile does not say" - and that closed winnable bids
  // on gaps in our own data. Now it caps the verdict at maybe and names the
  // question, which is both the honest answer and the useful one: every
  // unclear here is a specific line Khaled can add to the profile once and
  // never be asked about again.
  const unclear = checks
    .filter((c) => c.result === "unclear" && c.is_required === true)
    // Obtainable requirements are tracked on the compliance checklist instead,
    // which is where the scope put them and where they can actually be ticked.
    .filter((c) => NON_RESPONSIVE.test(c.requirement_text ?? ""));
  if (unclear.length > 0) {
    const list = unclear
      .map((c) => c.requirement_text?.trim())
      .filter(Boolean)
      .map((text) => truncate(text as string, 90));
    return {
      status: "maybe",
      reason:
        `Scores ${Math.round(scorePercent)}% and fails nothing outright, but the eligibility profile does not say ` +
        `whether Caravann meets ${unclear.length} mandatory requirement${unclear.length > 1 ? "s" : ""}: ` +
        `${list.join("; ")}. Confirm ${unclear.length > 1 ? "these" : "this"} and the verdict settles.`,
    };
  }

  const score = Math.round(scorePercent);
  // Everything still unmet at this point is scored rather than fatal, so it is
  // named as context and nothing more. The two kinds are counted separately
  // because they read differently to the person deciding: a preferred item was
  // never going to be met, while a stated requirement the agency scores is a
  // place the proposal has to work harder.
  const unmet = checks.filter((c) => c.result === "fail");
  const preferredMisses = unmet.filter((c) => c.is_required === false).length;
  const statedMisses = unmet.length - preferredMisses;
  const note =
    [
      statedMisses > 0
        ? `${statedMisses} stated requirement${statedMisses > 1 ? "s" : ""} not met, which the agency scores rather than rejects`
        : "",
      preferredMisses > 0
        ? `${preferredMisses} preferred item${preferredMisses > 1 ? "s" : ""} not met`
        : "",
    ]
      .filter(Boolean)
      .join(", ");
  const noteText = note ? ` ${note[0].toUpperCase()}${note.slice(1)}.` : "";

  // The gate above has already passed, so nothing here is disqualifying - the
  // only question left is degree of fit, and that is exactly the judgement the
  // reads disagreed about. Claiming go or no-go on a 35-point spread would be
  // inventing a confidence the evidence does not support.
  const limit = thresholds.maxSpread ?? DEFAULT_MAX_SPREAD;
  if (samples && samples.length > 1 && consensusGap(samples) > limit) {
    return {
      status: "maybe",
      reason:
        `No two of the ${samples.length} reads agreed on this solicitation ` +
        `(${[...samples].sort((a, b) => a - b).join(", ")}) - the closest were ${consensusGap(samples)} points apart, ` +
        `past the ${limit}-point tolerance. Median is ${score}%, but read it yourself before deciding.`,
    };
  }

  if (score >= thresholds.go) {
    return { status: "go", reason: `Clears every mandatory requirement and scores ${score}%.${noteText}` };
  }
  if (score >= thresholds.maybe) {
    return {
      status: "maybe",
      reason: `Clears every mandatory requirement but scores ${score}%, below the ${thresholds.go}% mark for a clear go.${noteText}`,
    };
  }
  return {
    status: "no_go",
    reason: `Scores ${score}%, below the ${thresholds.maybe}% floor - too thin an overlap to be worth the hours.${noteText}`,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
