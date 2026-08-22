/**
 * An edge case description, split into something a person can scan.
 *
 * Most of them are one sentence and need nothing doing. The exception is the
 * unconfirmed-requirements case, which is written as a lead followed by every
 * requirement joined with semicolons, and one real example on this desk carries
 * fifteen of them in a single paragraph. Six lines of unbroken text listing
 * fifteen separate obligations is not something anybody reads; it is something
 * they skip, on the one page whose entire job is deciding.
 *
 * The stored format stays as it is, because it is also what goes to Slack, into
 * the CSV export and into the record of what was decided. Only the display
 * changes.
 */

/** The one generated description that carries a list. Matched exactly rather
 *  than by looking for any colon, because requirement text is full of them. */
const LIST_LEAD = /^(.*?could not be confirmed from the document):\s*/i;

export type EdgeCaseText = {
  /** The sentence to show first. Always present. */
  lead: string;
  /** The individual items, empty when the description is not a list. */
  items: string[];
};

export function splitEdgeCase(description: string | null | undefined): EdgeCaseText {
  const text = String(description ?? "").trim();
  const match = text.match(LIST_LEAD);
  if (!match) return { lead: text, items: [] };

  const items = text
    .slice(match[0].length)
    // The inverse of the join that built it. A requirement containing its own
    // semicolon splits into two lines, which is a much smaller problem than the
    // paragraph this replaces.
    .split(";")
    .map((s) => s.trim().replace(/[.;]+$/, ""))
    .filter(Boolean);

  // A lead with nothing after it is not a list, whatever it looked like.
  if (items.length === 0) return { lead: text, items: [] };

  return { lead: `${match[1].trim()}:`, items };
}
