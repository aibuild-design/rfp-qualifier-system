/**
 * What Khaled actually pursues, learned from what he does rather than what he
 * says.
 *
 * An override tells you he disagreed once. His behaviour tells you what he
 * wants, on every bid, without him having to write anything down, and it is
 * already recorded: whether a draft exists, whether anyone was confirmed onto
 * it, whether questions were approved, whether the deadline went past untouched.
 *
 * **Effort, not attention.** Opening a page is not evidence, and dwell time is
 * worse than useless here: a bid he stared at for ten minutes and rejected
 * looks identical to one he read carefully and wanted. Every signal below costs
 * him something real, which is what makes it honest. Pressing Draft is a
 * decision to spend an afternoon; confirming a consultant is a commitment to a
 * person. Nothing here needs a tracking pixel, a click log or a timer, and
 * nothing would be improved by adding one.
 *
 * The output is descriptive and says so. "The bids you pursue tend to be public
 * agencies over $100k" is useful context for the next triage. It is not a rule,
 * it is not applied automatically, and where the sample is small it says the
 * sample is small rather than dressing four bids up as a pattern.
 */

export type BidSignals = {
  id: string;
  title: string;
  /** What the desk decided, before any human touched it. */
  computed: "go" | "maybe" | "no_go" | "pending";
  humanVerdict: "go" | "maybe" | "no_go" | null;
  /** He asked for a proposal. The most expensive thing he can do. */
  drafted: boolean;
  /** He put named people on it. */
  teamConfirmed: number;
  /** He approved questions to send the agency. */
  questionsApproved: number;
  /** He turned questions down, which is still engagement. */
  questionsDeclined: number;
  /** Compliance items he worked through by hand. */
  complianceTicked: number;
  dueAt: string | null;
  /** Attributes to look for patterns in. */
  sector: string | null;
  budget: number | null;
  agency: string | null;
};

export type Engagement = "pursued" | "rejected" | "ignored" | "undecided";

/**
 * How much this bid actually cost him.
 *
 * Ordered by what each act commits: drafting and staffing are work, a verdict
 * is a sentence, and doing nothing until the deadline passes is the clearest
 * negative there is, because it is a decision made by omission.
 */
export function engagementOf(bid: BidSignals, now: Date = new Date()): Engagement {
  if (bid.drafted || bid.teamConfirmed > 0) return "pursued";
  if (bid.humanVerdict === "go") return "pursued";
  if (bid.humanVerdict === "no_go") return "rejected";

  const expired = bid.dueAt ? new Date(bid.dueAt).getTime() < now.getTime() : false;
  const untouched =
    bid.questionsApproved === 0 && bid.questionsDeclined === 0 && bid.complianceTicked === 0;

  // Let go without a word. Only counted once the deadline has actually passed,
  // because a bid nobody has reached yet is not a bid anybody rejected.
  if (expired && untouched && bid.humanVerdict === null) return "ignored";

  return "undecided";
}

export type Trait = {
  label: string;
  /** How often it holds among pursued bids, and among the rest. */
  pursuedRate: number;
  otherRate: number;
  /** Positive means he leans toward it. */
  lean: number;
  basedOn: number;
};

export type Preferences = {
  pursued: number;
  rejected: number;
  ignored: number;
  /** Traits he leans toward, strongest first. */
  likes: Trait[];
  /** Traits he leans away from. */
  avoids: Trait[];
  /** Below this nothing is claimed, and the panel says why. */
  enoughToSay: boolean;
};

/** Under this, differences are noise dressed as insight. */
export const MIN_PURSUED = 5;

const TRAITS: [string, (b: BidSignals) => boolean][] = [
  ["a budget over $100k", (b) => (b.budget ?? 0) >= 100_000],
  ["a budget under $50k", (b) => b.budget !== null && b.budget < 50_000],
  ["no budget stated", (b) => b.budget === null],
  ["public agencies", (b) => /county|city|district|authority|agency|transit|state|municipal|public/i.test(b.agency ?? "")],
  ["healthcare", (b) => /health|hospital|clinic|medical|behavioral/i.test(`${b.sector ?? ""} ${b.title}`)],
  ["education", (b) => /school|education|university|college|k-12|campus/i.test(`${b.sector ?? ""} ${b.title}`)],
  ["transit", (b) => /transit|transport|rail|bus/i.test(`${b.sector ?? ""} ${b.title}`)],
  ["facilitation work", (b) => /facilitat|retreat|workshop|convening/i.test(b.title)],
  ["strategic planning", (b) => /strategic plan|strategy|roadmap/i.test(b.title)],
  ["organizational assessment", (b) => /assessment|organizational development|culture|change management/i.test(b.title)],
  ["on-call or pool contracts", (b) => /on-call|on call|as-needed|pool|idiq|master agreement/i.test(b.title)],
  ["bids the desk was unsure about", (b) => b.computed === "maybe"],
];

export function learnPreferences(bids: BidSignals[], now: Date = new Date()): Preferences {
  const labelled = bids.map((b) => ({ bid: b, engagement: engagementOf(b, now) }));
  const pursued = labelled.filter((x) => x.engagement === "pursued").map((x) => x.bid);
  const rejected = labelled.filter((x) => x.engagement === "rejected").map((x) => x.bid);
  const ignored = labelled.filter((x) => x.engagement === "ignored").map((x) => x.bid);

  // Everything he did not pursue, whether he said so or simply let it go.
  const others = [...rejected, ...ignored];

  const enoughToSay = pursued.length >= MIN_PURSUED && others.length >= 2;
  if (!enoughToSay) {
    return { pursued: pursued.length, rejected: rejected.length, ignored: ignored.length, likes: [], avoids: [], enoughToSay: false };
  }

  const traits: Trait[] = [];
  for (const [label, holds] of TRAITS) {
    const inPursued = pursued.filter(holds).length;
    const inOthers = others.filter(holds).length;
    // A trait nobody has is not a preference, it is an empty column.
    if (inPursued + inOthers === 0) continue;

    const pursuedRate = inPursued / pursued.length;
    const otherRate = inOthers / others.length;
    traits.push({
      label,
      pursuedRate,
      otherRate,
      lean: pursuedRate - otherRate,
      basedOn: inPursued + inOthers,
    });
  }

  // A third of the way apart, which on these sample sizes is the smallest gap
  // worth reporting without pretending to significance nobody has earned.
  const MEANINGFUL = 0.34;
  return {
    pursued: pursued.length,
    rejected: rejected.length,
    ignored: ignored.length,
    likes: traits.filter((t) => t.lean >= MEANINGFUL).sort((a, b) => b.lean - a.lean),
    avoids: traits.filter((t) => t.lean <= -MEANINGFUL).sort((a, b) => a.lean - b.lean),
    enoughToSay: true,
  };
}

/**
 * The preference summary, as a line for the triage prompt.
 *
 * Written as observation rather than instruction on purpose. "He tends to
 * pursue X" lets the model weigh it against the document in front of it; "score
 * X higher" would make it a rule the rubric does not contain, applied to bids
 * nobody has seen yet.
 */
export function preferenceBlock(p: Preferences): string {
  if (!p.enoughToSay || (p.likes.length === 0 && p.avoids.length === 0)) return "";
  const parts: string[] = [];
  if (p.likes.length) parts.push(`tends to pursue: ${p.likes.slice(0, 4).map((t) => t.label).join(", ")}`);
  if (p.avoids.length) parts.push(`tends to let go: ${p.avoids.slice(0, 3).map((t) => t.label).join(", ")}`);
  return `Observed across ${p.pursued} bids he pursued and ${p.rejected + p.ignored} he did not, he ${parts.join("; ")}. This is a pattern in his past behaviour, not a rule: weigh it against what this document actually says.`;
}
