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

export type Thresholds = { go: number; maybe: number };

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
  thresholds: Thresholds = THRESHOLDS
): Decision {
  const failed = checks.filter((c) => c.result === "fail");

  // "Preferred but not met" costs score; it never closes the door on its own.
  const blocking = failed.filter((c) => c.is_required === true || c.is_hard_knockout === true);
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

  const score = Math.round(scorePercent);
  const softMisses = failed.length;
  const note = softMisses > 0 ? ` ${softMisses} preferred requirement${softMisses > 1 ? "s" : ""} not met.` : "";

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
