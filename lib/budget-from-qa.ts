/**
 * A budget that only appears in the agency's answers.
 *
 * Module 5 asks for this explicitly: "It also reads any agency Q&A document you
 * forward or upload, so a number that only shows up in the Q&A still lands on
 * the card." Bidders ask about budget in almost every question round, because
 * the RFP so often omits it, and the answer is frequently a real number.
 *
 * Rules rather than a model call. The document has already been classified by
 * this point, and the shape being looked for is narrow: a dollar figure in a
 * sentence about money. Spending eighteen cents to re-read a document the desk
 * has already paid to classify, in order to find a number a regular expression
 * can see, is not a good trade.
 *
 * Deliberately conservative. It only offers a number when the sentence around
 * it is unambiguously about the value of this contract, and it refuses when the
 * agency says there is no budget, which is itself an answer worth recording.
 */

/** Words that make a dollar figure the contract's value rather than a threshold. */
const ABOUT_THE_MONEY =
  /budget|not[- ]to[- ]exceed|nte\b|contract value|annual spend|estimated (?:cost|value|amount)|anticipated (?:cost|value|spend)|maximum (?:amount|compensation)|total compensation|award amount|funding available/i;

/**
 * Sentences that mention money but are not the budget. Insurance limits are the
 * dangerous ones: "$2,000,000 general liability" is a dollar figure in a
 * procurement document and reading it as the contract value would put a
 * two-million-dollar budget on a forty-thousand-dollar job.
 */
const NOT_THE_BUDGET =
  /insur|liabilit|coverage|bond|penalt|damages|fee schedule|hourly|per hour|w-?9|late fee/i;

/** The agency saying, in answer to the question, that there is no budget. */
const EXPLICIT_NONE =
  /has not established|no (?:guaranteed|established|predetermined|anticipated) (?:annual )?(?:budget|spending|amount)|does not guarantee|no minimum|not established a/i;

export type QaBudget =
  | { found: true; amount: number; quote: string }
  | { found: false; reason: "explicitly none" | "nothing stated" };

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function amountIn(sentence: string): number | null {
  // $1.2 million and $1,200,000 are the same answer written two ways.
  const scaled = sentence.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(million|m\b|k\b|thousand)/i);
  if (scaled) {
    const n = Number(scaled[1].replace(/,/g, ""));
    const unit = scaled[2].toLowerCase();
    if (!Number.isFinite(n)) return null;
    return unit.startsWith("m") ? n * 1_000_000 : n * 1_000;
  }
  const plain = sentence.match(/\$\s?([\d][\d,]{2,})(?:\.\d\d)?/);
  if (!plain) return null;
  const n = Number(plain[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function budgetFromQa(text: string): QaBudget {
  let sawTheQuestion = false;

  for (const s of sentences(text)) {
    if (!ABOUT_THE_MONEY.test(s)) continue;
    sawTheQuestion = true;

    if (NOT_THE_BUDGET.test(s)) continue;
    if (EXPLICIT_NONE.test(s)) return { found: false, reason: "explicitly none" };

    const amount = amountIn(s);
    // Under a thousand is a page count, a section number or a form ID that
    // happens to sit behind a dollar sign, not the value of a contract.
    if (amount !== null && amount >= 1000) {
      return { found: true, amount, quote: s.slice(0, 240) };
    }
  }

  return { found: false, reason: sawTheQuestion ? "explicitly none" : "nothing stated" };
}
