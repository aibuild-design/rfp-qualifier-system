/**
 * How much this agency is buying on price.
 *
 * Module 8 asked for a cost lane flag and never had one. The Price section
 * drafted a rate methodology in the same voice whatever the solicitation said,
 * which means it read identically for an agency awarding 15% on cost and one
 * awarding 50% - and those are two different bids. The second is won or lost on
 * the number; the first is won on approach and lost by discounting into a
 * credibility problem.
 *
 * The weighting is already in the document and already captured: the model
 * records evaluation criteria as compliance items in the `rubric` category. So
 * nothing new is read. This reads what is already there and says what it means.
 *
 * Parsing rather than asking the model for a lane, because the arithmetic is
 * the whole judgement and a percentage is not a matter of opinion.
 *
 * The shape this has to survive is not "Cost: 30%". Real captured items look
 * like one label and one sentence listing every criterion at once:
 *
 *   label:  "Evaluation Criteria Weights"
 *   detail: "Relevant public agency experience 30 pts, Facilitation approach
 *            and methodology 30 pts, Qualifications of assigned personnel
 *            25 pts, Cost 15 pts."
 *
 * so the number belonging to cost has to be found by its neighbours, and the
 * denominator by adding up the others. A parser that scanned the whole string
 * for a percentage would find nothing here, or worse, find 30.
 */

export type CostLane = {
  /** The weighting found, 0-100. */
  percent: number;
  lane: "price_led" | "balanced" | "quality_led";
  /** One line for a human, naming the number it came from. */
  note: string;
  /** The text this was read out of, so the claim is checkable. */
  source: string;
};

/**
 * Where the lines sit.
 *
 * Not invented: 40% and up is the point at which public-sector scoring
 * commonly makes price decisive against a field of technically acceptable
 * bidders, and below 25% price is a tiebreak rather than a lever. The middle is
 * genuinely the middle, and saying so is more useful than forcing a call.
 */
const PRICE_LED_AT = 40;
const QUALITY_LED_BELOW = 25;

/** Words that mean "this line is about money" in an evaluation table. */
const COST_WORDS = /\b(cost|price|pricing|fee|fees|rate|rates|financial|budget)\b/i;

/** A criterion and its weight, as written. */
type Criterion = { text: string; value: number; unit: "percent" | "points" };

/**
 * Split one captured item into the criteria it lists.
 *
 * Semicolons, commas and newlines all appear as the separator in real captures,
 * sometimes two of them in one string.
 */
function criteriaIn(text: string): Criterion[] {
  const out: Criterion[] = [];
  for (const raw of text.split(/[;,\n]|(?<=\.)\s+/)) {
    const segment = raw.trim();
    if (!segment) continue;
    // "30 pts", "30 points", "30%", "30 percent". The number must sit next to
    // the unit: a segment reading "Section 3 experience 30 pts" has two numbers
    // and only one of them is a weight.
    const m = segment.match(/(\d{1,3}(?:\.\d+)?)\s*(%|percent|pts?\b|points?\b)/i);
    if (!m) continue;
    const value = Number(m[1]);
    if (!Number.isFinite(value) || value <= 0) continue;
    out.push({
      text: segment,
      value,
      unit: /%|percent/i.test(m[2]) ? "percent" : "points",
    });
  }
  return out;
}

/**
 * Read the cost weighting out of the captured evaluation criteria.
 *
 * Returns null when the document never states one, which is common and is not
 * a failure: plenty of solicitations describe their criteria without numbers,
 * and inventing a weighting would be worse than having none.
 */
export function costLaneFrom(
  items: {
    category?: string | null;
    label?: string | null;
    detail?: string | null;
    requirement_text?: string | null;
  }[],
): CostLane | null {
  let best: { percent: number; source: string } | null = null;

  for (const item of items) {
    if (item.category !== "rubric") continue;
    // requirement_text is carried for callers that pass disqualifier-shaped
    // rows; compliance items are label plus detail, and the weights live in
    // the detail.
    const text = [item.label, item.detail, item.requirement_text].filter(Boolean).join(". ");
    if (!text || !COST_WORDS.test(text)) continue;

    // "Cost: 45 points out of 100" states its own denominator, so it never
    // needs the others.
    const explicit = text.match(
      /(?:cost|price|pricing|fee|financial)[^.;,\n]{0,40}?(\d{1,3})\s*points?\s*(?:out\s*of|of|\/)\s*(\d{1,3})/i,
    );
    if (explicit && Number(explicit[2]) > 0) {
      const pct = (Number(explicit[1]) / Number(explicit[2])) * 100;
      if (pct > 0 && pct <= 100 && (!best || pct > best.percent)) {
        best = { percent: Math.round(pct), source: text };
      }
      continue;
    }

    const criteria = criteriaIn(text);
    const costOnes = criteria.filter((c) => COST_WORDS.test(c.text));
    if (costOnes.length === 0) continue;

    // The highest cost-related weighting wins. A solicitation listing both
    // "cost realism 10 pts" and "cost proposal 35 pts" is buying at 35, and
    // taking the first would depend on the order the model happened to emit.
    const cost = costOnes.reduce((a, b) => (b.value > a.value ? b : a));

    let percent: number;
    if (cost.unit === "percent") {
      percent = cost.value;
    } else {
      // Points only mean something against a total, and the total is the other
      // criteria in the same list. Falling back to 100 when cost is the only
      // line stated would read "cost 15 pts" as 15%, which is right often
      // enough to be dangerous and wrong when the scale is out of 50.
      const total = criteria
        .filter((c) => c.unit === "points")
        .reduce((sum, c) => sum + c.value, 0);
      if (total <= 0 || cost.value > total) continue;
      if (criteria.filter((c) => c.unit === "points").length < 2) continue;
      percent = (cost.value / total) * 100;
    }

    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) continue;
    const rounded = Math.round(percent);
    if (!best || rounded > best.percent) best = { percent: rounded, source: text };
  }

  if (!best) return null;

  const lane =
    best.percent >= PRICE_LED_AT
      ? "price_led"
      : best.percent < QUALITY_LED_BELOW
        ? "quality_led"
        : "balanced";

  const note =
    lane === "price_led"
      ? `Cost is ${best.percent}% of the award. This is won or lost on the number: price tight, and justify the hours rather than the rate.`
      : lane === "quality_led"
        ? `Cost is only ${best.percent}% of the award. Approach and team decide this one, so a premium rate is defensible and discounting buys almost nothing.`
        : `Cost is ${best.percent}% of the award, which is neither decisive nor ignorable. Price at your normal rate and spend the effort on approach.`;

  return { percent: best.percent, lane, note, source: best.source };
}
