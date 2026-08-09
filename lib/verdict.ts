/**
 * Turns a score and a set of gate checks into go / maybe / no-go.
 *
 * The model used to choose the label itself, and it was not reproducible: the
 * same solicitation, run three times at temperature 0, came back
 * `maybe / 83`, `go / 87`, `go / 88`. The underlying read barely moved — the
 * model just picked a different side of a boundary it invented on the spot.
 * On a desk where the label decides whether a week gets spent, a verdict that
 * changes between runs is not a verdict.
 *
 * So the model now reports what it found — a score, and pass/fail per
 * requirement — and the label is arithmetic. Same input, same answer, every
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
   *  default — the SOW is explicit that preferred lowers the score rather than
   *  killing it, and turning it on will rule out winnable work. */
  preferredIsFatal?: boolean;
};

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
    | undefined
): Thresholds {
  return {
    go: row?.go_threshold ?? THRESHOLDS.go,
    maybe: row?.maybe_threshold ?? THRESHOLDS.maybe,
    preferredIsFatal: row?.preferred_misses_are_fatal ?? false,
    maxSpread: row?.max_score_spread ?? DEFAULT_MAX_SPREAD,
  };
}

/** Default disagreement tolerance. Twenty points is wide enough that ordinary
 *  model wobble passes, and narrow enough to catch the 55-among-90s case. */
export const DEFAULT_MAX_SPREAD = 20;

/** How far apart the furthest two reads were. Useful to display; a poor basis
 *  for a decision — see consensusGap. */
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
 * an off run — which is often.
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
 * boundary can be tuned without a code change — the whole point of moving it
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

export type Decision = {
  status: VerdictStatus;
  /** Plain-language account of which rule fired, shown in the UI and the log. */
  reason: string;
};

/**
 * A failed requirement outranks any score. A solicitation demanding three years
 * of behavioral health experience is not a 40% fit for a firm with none — it is
 * closed, and no amount of overlap elsewhere reopens it.
 */
export function decideVerdict(
  scorePercent: number | null | undefined,
  checks: readonly GateCheck[] = [],
  thresholds: Thresholds = THRESHOLDS,
  /** Every score the triage runs returned. When they disagree badly, the
   *  honest verdict is "look at this yourself" rather than a confident call. */
  samples: readonly number[] | null = null
): Decision {
  const failed = checks.filter((c) => c.result === "fail");

  // "Preferred but not met" costs score; it never closes the door on its own —
  // unless Khaled has said otherwise for his own firm.
  const blocking = failed.filter(
    (c) => c.is_required === true || c.is_hard_knockout === true || thresholds.preferredIsFatal === true
  );
  if (blocking.length > 0) {
    const first = blocking[0].requirement_text?.trim();
    return {
      status: "no_go",
      reason: `Fails ${blocking.length} mandatory requirement${blocking.length > 1 ? "s" : ""}${
        first ? `, starting with: ${truncate(first, 120)}` : ""
      }.`,
    };
  }

  // No score means triage has not finished, not that the answer is no.
  if (scorePercent === null || scorePercent === undefined || !Number.isFinite(scorePercent)) {
    return { status: "pending", reason: "No score yet — triage has not returned." };
  }

  // A requirement the profile is silent on is not a requirement Caravann
  // fails. It used to be treated as one, because "fail" was the only answer
  // available for "the profile does not say" — and that closed winnable bids
  // on gaps in our own data. Now it caps the verdict at maybe and names the
  // question, which is both the honest answer and the useful one: every
  // unclear here is a specific line Khaled can add to the profile once and
  // never be asked about again.
  const unclear = checks.filter((c) => c.result === "unclear" && c.is_required === true);
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
  const softMisses = failed.length;
  const note = softMisses > 0 ? ` ${softMisses} preferred requirement${softMisses > 1 ? "s" : ""} not met.` : "";

  // The gate above has already passed, so nothing here is disqualifying — the
  // only question left is degree of fit, and that is exactly the judgement the
  // reads disagreed about. Claiming go or no-go on a 35-point spread would be
  // inventing a confidence the evidence does not support.
  const limit = thresholds.maxSpread ?? DEFAULT_MAX_SPREAD;
  if (samples && samples.length > 1 && consensusGap(samples) > limit) {
    return {
      status: "maybe",
      reason:
        `No two of the ${samples.length} reads agreed on this solicitation ` +
        `(${[...samples].sort((a, b) => a - b).join(", ")}) — the closest were ${consensusGap(samples)} points apart, ` +
        `past the ${limit}-point tolerance. Median is ${score}%, but read it yourself before deciding.`,
    };
  }

  if (score >= thresholds.go) {
    return { status: "go", reason: `Clears every mandatory requirement and scores ${score}%.${note}` };
  }
  if (score >= thresholds.maybe) {
    return {
      status: "maybe",
      reason: `Clears every mandatory requirement but scores ${score}%, below the ${thresholds.go}% mark for a clear go.${note}`,
    };
  }
  return {
    status: "no_go",
    reason: `Scores ${score}%, below the ${thresholds.maybe}% floor — too thin an overlap to be worth the hours.${note}`,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
