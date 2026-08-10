/**
 * How the 0-100 score is produced.
 *
 * Nothing downstream changes: the output is still a percentage, still fed to
 * the same thresholds, still turned into the same go / maybe / no-go. What
 * changes is where the number comes from.
 *
 * The prompt used to ask for "capability overlap, 0-100" - an open-ended
 * numeric judgement with no anchors. Ask a human expert to do that on three
 * different days and you get the same 10-30 point spread we measured from the
 * model (55, 82, 86, 88, 90 on one document). The task was under-specified;
 * the model was re-inventing the scale on every read.
 *
 * So the model no longer produces the number. It answers five questions with
 * defined anchors - "is Caravann's depth in this sector none, thin, adequate
 * or strong?" - and the arithmetic happens here. That is the same move that
 * already fixed the label: take the judgement the model is good at
 * (classification against a described standard), and keep the judgement it is
 * bad at (inventing a scale) out of its hands.
 *
 * Three things fall out of it beyond stability:
 *   · every score explains itself, line by line, instead of being "84%"
 *   · the weights become Khaled's to set, not ours to bake in
 *   · disagreement gets specific - "two reads said strong, one said thin" is
 *     checkable in a way that "the reads disagreed" is not
 */

export type RubricLevel = { value: string; points: number; description: string };

export type RubricDimension = {
  key: string;
  label: string;
  /** What the model is being asked to judge. Goes into the prompt verbatim. */
  question: string;
  levels: RubricLevel[];
};

/**
 * The levels are deliberately few and far apart. "Strong vs adequate" is a
 * judgement a reader can defend; "84 vs 79" is not, and asking for it is what
 * produced the variance in the first place.
 *
 * Maximum points sum to 100, so a perfect fit scores 100 and the number keeps
 * the meaning it already had on every card and export.
 */
export const RUBRIC: RubricDimension[] = [
  {
    key: "sector_depth",
    label: "Sector depth",
    question:
      "How deep is Caravann's recorded experience in the sector this solicitation sits in? Judge only against the sector experience map - never assume depth that is not recorded.",
    levels: [
      { value: "none", points: 0, description: "No recorded experience in this sector" },
      { value: "thin", points: 10, description: "Some experience, but shallow for the scope" },
      { value: "adequate", points: 20, description: "Solid, comparable experience" },
      { value: "strong", points: 30, description: "Squarely the work Caravann already does" },
    ],
  },
  {
    key: "comparable_engagements",
    label: "Comparable engagements",
    question:
      "How many comparable engagements has Caravann delivered - same kind of work, similar client type and scale?",
    levels: [
      { value: "none", points: 0, description: "None on record" },
      { value: "few", points: 8, description: "One or two" },
      { value: "several", points: 16, description: "Three to five" },
      { value: "many", points: 25, description: "Six or more" },
    ],
  },
  {
    key: "geographic_fit",
    label: "Geographic fit",
    question:
      "Does the solicitation need people on the ground, and can Caravann provide them from its recorded office and consultant locations?",
    levels: [
      { value: "none", points: 0, description: "Local presence needed and absent" },
      { value: "remote_ok", points: 8, description: "Deliverable remotely, or travel is workable" },
      { value: "local", points: 15, description: "Caravann already has presence in the area" },
    ],
  },
  {
    key: "timeline",
    label: "Timeline",
    question:
      "Is there enough runway between now and the submission deadline, and is the delivery schedule the solicitation sets out achievable?",
    levels: [
      { value: "infeasible", points: 0, description: "Cannot realistically be met" },
      { value: "tight", points: 8, description: "Achievable but demanding" },
      { value: "comfortable", points: 15, description: "Comfortable runway" },
    ],
  },
  {
    key: "budget_vs_effort",
    label: "Budget against effort",
    question:
      "Does the stated budget cover the effort the scope implies? If no budget is named anywhere, judge on scope alone and say so in the note.",
    levels: [
      { value: "underfunded", points: 0, description: "Budget will not cover the work" },
      { value: "adequate", points: 8, description: "Budget matches the effort" },
      { value: "generous", points: 15, description: "Budget is comfortable for the scope" },
    ],
  },
];

export const RUBRIC_MAX = RUBRIC.reduce(
  (total, d) => total + Math.max(...d.levels.map((l) => l.points)),
  0
);

/** What the model returns for one dimension. */
export type RubricAnswer = { level: string; note?: string | null };
export type RubricBreakdown = Record<string, RubricAnswer>;

/** Per-dimension maximums, so the weighting is Khaled's to change without a
 *  prompt rewrite. Keys are dimension keys; a missing key keeps the default. */
export type RubricWeights = Record<string, number>;

export const DEFAULT_WEIGHTS: RubricWeights = Object.fromEntries(
  RUBRIC.map((d) => [d.key, Math.max(...d.levels.map((l) => l.points))])
);

export type ScoredDimension = {
  key: string;
  label: string;
  level: string;
  levelDescription: string;
  points: number;
  maxPoints: number;
  note?: string | null;
};

export type RubricScore = {
  /** 0-100, the same scale everything downstream already expects. */
  score: number;
  dimensions: ScoredDimension[];
  /** Dimensions the model did not answer, or answered with an unknown level. */
  missing: string[];
};

/**
 * Turn the classifications into the score.
 *
 * Rescaled to 0-100 over the dimensions that were actually answered, so a
 * partial response degrades to a fair score rather than a artificially low one
 * - a model that skipped "timeline" should not cost the bid 15 points it never
 * had the chance to earn.
 */
export function scoreFromRubric(
  breakdown: RubricBreakdown | null | undefined,
  weights: RubricWeights = DEFAULT_WEIGHTS
): RubricScore | null {
  if (!breakdown || typeof breakdown !== "object") return null;

  const dimensions: ScoredDimension[] = [];
  const missing: string[] = [];
  let earned = 0;
  let available = 0;

  for (const dimension of RUBRIC) {
    const answer = breakdown[dimension.key];
    const level = dimension.levels.find((l) => l.value === answer?.level);
    if (!level) {
      missing.push(dimension.key);
      continue;
    }

    // Weights rescale the dimension proportionally: the model classifies, the
    // weighting decides how much that classification is worth.
    const defaultMax = Math.max(...dimension.levels.map((l) => l.points));
    const maxPoints = weights[dimension.key] ?? defaultMax;
    const points = defaultMax === 0 ? 0 : (level.points / defaultMax) * maxPoints;

    earned += points;
    available += maxPoints;
    dimensions.push({
      key: dimension.key,
      label: dimension.label,
      level: level.value,
      levelDescription: level.description,
      points: Math.round(points),
      maxPoints: Math.round(maxPoints),
      note: answer?.note ?? null,
    });
  }

  if (dimensions.length === 0 || available === 0) return null;

  return { score: Math.round((earned / available) * 100), dimensions, missing };
}

/** The rubric rendered for the prompt, so the anchors the model is judging
 *  against and the anchors we score against can never drift apart. */
export function rubricForPrompt(): string {
  return RUBRIC.map((d) => {
    const levels = d.levels.map((l) => `      "${l.value}" - ${l.description}`).join("\n");
    return `  ${d.key} - ${d.label}\n    ${d.question}\n${levels}`;
  }).join("\n\n");
}

/** The JSON-schema fragment for the rubric object, generated from the same
 *  definition so the enum can never fall out of step with the levels. */
export function rubricSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: RUBRIC.map((d) => d.key),
    properties: Object.fromEntries(
      RUBRIC.map((d) => [
        d.key,
        {
          type: "object",
          additionalProperties: false,
          required: ["level", "note"],
          properties: {
            level: { type: "string", enum: d.levels.map((l) => l.value) },
            note: { type: ["string", "null"] },
          },
        },
      ])
    ),
  };
}
