/**
 * What the desk gets wrong, measured against Khaled.
 *
 * Every override is already recorded: the computed verdict, the one he chose
 * instead, and his reason. Until now none of it was read back. The single most
 * valuable signal in the system, a person saying "you said maybe, I say go, and
 * here is why", was being written to a column and forgotten.
 *
 * Two things are done with it here, and neither retunes anything on its own.
 * The SOW is explicit that a system making go and no-go calls on real money
 * does not adjust its own thresholds, and that is the right rule: the failure
 * mode of self-tuning is a desk that drifts toward agreeing with whatever it
 * did last, which looks like learning and is actually a feedback loop.
 *
 *   1. **Examples into the prompt.** His past calls, with reasons, go into
 *      triage as worked examples. That is learning in the only sense that is
 *      safe here: the model sees how this particular firm judges, rather than
 *      the desk quietly moving its own goalposts.
 *
 *   2. **Proposals, with evidence.** Where the disagreements form a pattern,
 *      the specific change that would fix it is proposed and waits for him.
 *      The weekly review already has approve and reject for exactly this.
 */

export type Override = {
  id: string;
  title: string;
  /** What the desk computed. */
  computed: "go" | "maybe" | "no_go" | "pending";
  /** What Khaled decided instead. */
  human: "go" | "maybe" | "no_go";
  score: number | null;
  note: string | null;
  decidedAt: string | null;
};

export type Calibration = {
  /** Decisions where a person recorded a verdict at all. */
  decided: number;
  /** Where the two matched. */
  agreed: number;
  /** Agreement rate, or null below the point where a rate means anything. */
  agreementRate: number | null;
  /** The desk was more cautious than Khaled: he upgraded it. */
  tooHarsh: Override[];
  /** The desk was more optimistic: he downgraded it. */
  tooGenerous: Override[];
  proposals: Proposal[];
};

export type Proposal = {
  kind: "threshold" | "profile" | "watch";
  /** What to change, in plain words. */
  change: string;
  /** Why, with the numbers behind it. */
  evidence: string;
  /** How many decisions this rests on. Small numbers are stated, not hidden. */
  basedOn: number;
};

const RANK = { no_go: 0, pending: 0, maybe: 1, go: 2 } as const;

/**
 * Below this, a disagreement is an anecdote.
 *
 * Four is low for a statistic and high enough to stop one bad afternoon
 * rewriting the thresholds. Whatever it is set to, the count is always shown
 * alongside the proposal so nobody has to take the number on trust.
 */
export const MIN_FOR_A_PATTERN = 4;

export function calibrate(overrides: Override[], goThreshold: number): Calibration {
  const decided = overrides.length;
  const agreed = overrides.filter((o) => o.human === o.computed).length;

  const tooHarsh = overrides.filter((o) => RANK[o.human] > RANK[o.computed]);
  const tooGenerous = overrides.filter((o) => RANK[o.human] < RANK[o.computed]);

  const proposals: Proposal[] = [];

  // Bids he took that scored below the line. If they cluster just under it, the
  // line is in the wrong place, and the evidence is the scores themselves.
  const upgradedToGo = tooHarsh.filter((o) => o.human === "go" && typeof o.score === "number");
  if (upgradedToGo.length >= MIN_FOR_A_PATTERN) {
    const scores = upgradedToGo.map((o) => o.score as number).sort((a, b) => a - b);
    const highest = scores[scores.length - 1];
    // The lowest score he still called go. Anything above it he would have
    // taken, so that is where the line belongs, minus a point of slack.
    const suggested = Math.max(0, Math.min(...scores) - 1);
    if (highest < goThreshold) {
      proposals.push({
        kind: "threshold",
        change: `Lower the go threshold from ${goThreshold}% to ${suggested}%.`,
        evidence: `You called go on ${upgradedToGo.length} bids the desk scored below ${goThreshold}%, ranging ${Math.min(...scores)}% to ${highest}%. Every one of them would have been go at ${suggested}%.`,
        basedOn: upgradedToGo.length,
      });
    }
  }

  // Bids he rejected that the desk was happy with. Raising the bar is the
  // obvious move and usually the wrong one, so this proposes looking rather
  // than moving: the reasons matter more than the scores.
  const downgradedFromGo = tooGenerous.filter((o) => o.computed === "go");
  if (downgradedFromGo.length >= MIN_FOR_A_PATTERN) {
    proposals.push({
      kind: "watch",
      change: "Read these together before changing anything.",
      evidence: `The desk said go on ${downgradedFromGo.length} bids you turned down. Your reasons are the useful part, and they usually point at a fact the profile is missing rather than a threshold being wrong.`,
      basedOn: downgradedFromGo.length,
    });
  }

  // A reason repeated across bids is a missing fact, not a scoring problem.
  const themes = recurringReasons(overrides);
  for (const theme of themes) {
    proposals.push({
      kind: "profile",
      change: `Record ${theme.subject} in Settings.`,
      evidence: `"${theme.example}" and ${theme.count - 1} other note${theme.count > 2 ? "s" : ""} mention it. A fact stated once is a fact the gate stops asking about.`,
      basedOn: theme.count,
    });
  }

  return {
    decided,
    agreed,
    agreementRate: decided >= MIN_FOR_A_PATTERN ? Math.round((agreed / decided) * 100) : null,
    tooHarsh,
    tooGenerous,
    proposals,
  };
}

/**
 * Subjects Khaled keeps writing about in his override notes.
 *
 * Deliberately a small fixed vocabulary rather than anything clever. These are
 * the facts the gate can actually use, and matching loose words against them
 * finds "we do have insurance" and "insurance is fine" as the same point.
 */
const SUBJECTS: [RegExp, string][] = [
  [/insurance|liability|coverage|indemnif/i, "the insurance carried"],
  [/set[- ]aside|dbe\b|mbe\b|wbe\b|sbe\b|disadvantaged|minority[- ]owned/i, "set-aside status"],
  [/bilingual|spanish|translat|interpret/i, "bilingual capability"],
  [/healthcare|behavioral health|hospital|clinic/i, "healthcare sector experience"],
  [/transit|transport/i, "transit sector experience"],
  [/reference|past performance/i, "reference projects"],
  [/travel|on[- ]site|local presence|remote/i, "where the team can work"],
  [/certif|registration|sam\.gov|cage|uei/i, "certifications held"],
];

function recurringReasons(overrides: Override[]): { subject: string; count: number; example: string }[] {
  const found = new Map<string, { count: number; example: string }>();
  for (const o of overrides) {
    const note = o.note?.trim();
    if (!note) continue;
    for (const [re, subject] of SUBJECTS) {
      if (!re.test(note)) continue;
      const prior = found.get(subject);
      found.set(subject, {
        count: (prior?.count ?? 0) + 1,
        example: prior?.example ?? note.slice(0, 90),
      });
    }
  }
  return [...found.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([subject, v]) => ({ subject, ...v }));
}

/**
 * His past calls, as worked examples for the prompt.
 *
 * Only the disagreements, and only with a reason attached. A bid he agreed with
 * teaches nothing the rubric does not already encode, and an override with no
 * note is a fact without an argument: it says the desk was wrong without saying
 * what it missed, which is not something a model can generalise from.
 *
 * Capped, because this is pasted into every triage and grows forever otherwise.
 */
export function overrideExamples(overrides: Override[], limit = 8): string {
  const useful = overrides
    .filter((o) => o.human !== o.computed && o.note?.trim())
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
    .slice(0, limit);

  if (useful.length === 0) return "";

  return useful
    .map((o) => {
      const score = typeof o.score === "number" ? ` (${o.score}%)` : "";
      return `- "${o.title}"${score}: the desk said ${o.computed}, Khaled decided ${o.human}. His reason: ${o.note?.trim()}`;
    })
    .join("\n");
}
