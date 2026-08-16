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
 */

export type CostLane = {
  /** The weighting found, 0-100. */
  percent: number;
  lane: "price_led" | "balanced" | "quality_led";
  /** One line for a human, naming the number it came from. */
  note: string;
  /** The compliance item this was read out of, so the claim is checkable. */
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

/**
 * Read the cost weighting out of the captured evaluation criteria.
 *
 * Returns null when the document never states one, which is common and is not
 * a failure: plenty of solicitations describe their criteria without numbers,
 * and inventing a weighting would be worse than having none.
 */
export function costLaneFrom(
  items: { category?: string | null; requirement_text?: string | null }[],
): CostLane | null {
  const rubricish = items.filter(
    (i) => i.category === "rubric" && typeof i.requirement_text === "string",
  );

  let best: { percent: number; source: string } | null = null;
  for (const item of rubricish) {
    const text = item.requirement_text as string;
    if (!COST_WORDS.test(text)) continue;

    // Both shapes agencies write: "Cost: 30%" and "30% - Cost Proposal". Points
    // out of a stated total are handled too, because "30 points of 100" is the
    // same statement in different clothing.
    const pct = text.match(/(\d{1,3})\s*(?:%|percent)/i);
    const outOf = text.match(/(\d{1,3})\s*points?\s*(?:out\s*of|of|\/)\s*(\d{1,3})/i);

    let percent: number | null = null;
    if (pct) percent = Number(pct[1]);
    else if (outOf && Number(outOf[2]) > 0) percent = (Number(outOf[1]) / Number(outOf[2])) * 100;
    if (percent === null || !Number.isFinite(percent) || percent <= 0 || percent > 100) continue;

    // The highest cost-related weighting wins. A solicitation that lists both
    // "Cost 30%" and "Cost realism 10%" is buying on cost at 30, and taking the
    // first match would depend on the order the model happened to emit them.
    if (!best || percent > best.percent) best = { percent: Math.round(percent), source: text };
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
