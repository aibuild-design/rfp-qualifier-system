/**
 * Adapt a stitched section to the solicitation in front of it.
 *
 * The draft is assembled from Caravann's approved language and never invented,
 * which is the right default for a document that gets signed and submitted to a
 * public agency. The cost is that it reads the same whichever RFP it is for.
 * The SOW scoped a tailoring pass after assembly; this is it.
 *
 * The rule is narrow on purpose: **rearrange and re-word, never assert.** The
 * model may name the agency, mirror the solicitation's own vocabulary, drop a
 * sentence that does not apply and reorder what remains. It may not add a
 * number, a date, a client name, a credential or a promise, because every one
 * of those is a claim Caravann would be making to a government buyer on the
 * strength of a paraphrase.
 *
 * That rule is enforced rather than requested. `newClaims` compares the output
 * against the input and rejects anything numeric or capitalised that was not
 * already there, so a model that ignores the instruction produces a rejected
 * section instead of a false statement in a submitted proposal.
 */

export type TailorInput = {
  heading: string;
  body: string;
};

export type TailorResult = {
  heading: string;
  /** Null when the pass was rejected or changed nothing worth keeping. */
  tailored: string | null;
  /** Why it was rejected, for the person deciding whether to care. */
  rejected?: string;
};

/**
 * Tokens that would be a new factual claim if they appeared in the output
 * without being in the input.
 *
 * Numbers and capitalised words, which between them cover the things that can
 * actually hurt: dollar amounts, years, headcounts, percentages, agency names,
 * certifications, named individuals. Ordinary sentence-initial capitals are
 * excluded by requiring the word to appear mid-sentence.
 */
export function factualTokens(text: string, everyCapital = false): Set<string> {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/\b\d[\d,.]*\b/g)) tokens.add(m[0].replace(/[.,]$/, ""));
  // Sentence-initial capitals are skipped when reading prose, because "We" and
  // "The" are grammar rather than claims. They are kept when reading the
  // solicitation, which is a reference list rather than prose: the agency name
  // frequently starts it, and skipping the first word let "East" count as an
  // invention while "Bay Joint Powers Authority" did not.
  const pattern = everyCapital
    ? /\b([A-Z][A-Za-z.'-]{2,})\b/g
    : /(?<![.!?]\s)(?<!^)\b([A-Z][A-Za-z.'-]{2,})\b/gm;
  for (const m of text.matchAll(pattern)) tokens.add(m[1]);
  return tokens;
}

/**
 * Anything asserted in `after` that was neither in `before` nor in the
 * solicitation.
 *
 * The second source matters as much as the first. Naming the agency you are
 * writing to is the entire point of tailoring, so the solicitation's own words
 * cannot count as invention: an early version of this rejected "East Bay Joint
 * Powers Authority" as five new claims and would have blocked every useful
 * edit. What is guarded against is a claim about Caravann that neither
 * document makes.
 */
export function newClaims(before: string, after: string, fromSolicitation = ""): string[] {
  const had = factualTokens(before);
  const theirs = factualTokens(fromSolicitation, true);
  return [...factualTokens(after)].filter((t) => !had.has(t) && !theirs.has(t));
}

/**
 * Build the instruction. Kept here rather than inline so the rule the model is
 * given and the rule the code enforces sit in one file and can be read
 * together.
 */
export function tailorPrompt(context: {
  agency: string;
  title: string;
  solicitationNumber: string | null;
  scopeNotes: string;
}): string {
  return [
    "You adapt an existing proposal section to one specific solicitation.",
    "",
    "The text you are given is language the firm has already used and stands behind. Your job is to make it speak to this solicitation, not to write anything new.",
    "",
    "You MAY:",
    "- name the agency and the engagement where the text is generic",
    "- mirror the solicitation's own vocabulary for the work",
    "- drop a sentence that plainly does not apply to this solicitation",
    "- reorder sentences so the most relevant comes first",
    "",
    "You MUST NOT:",
    "- add any number, date, dollar amount, percentage, duration or headcount",
    "- add any client name, project name, certification, credential or person",
    "- add any commitment, guarantee or capability that is not already stated",
    "- lengthen the text materially. Shorter is fine, padded is not.",
    "",
    "Anything you add that was not already asserted will be rejected automatically and the original kept, so inventing costs you the edit.",
    "",
    "Never use an em dash or an en dash. Use a comma, a colon or a full stop.",
    "",
    `THE SOLICITATION: ${context.title}`,
    `AGENCY: ${context.agency}`,
    context.solicitationNumber ? `NUMBER: ${context.solicitationNumber}` : "",
    context.scopeNotes ? `WHAT IT ASKS FOR: ${context.scopeNotes}` : "",
    "",
    "Return only the adapted text. No preamble, no explanation, no quotes around it.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Decide whether a tailored section is safe to keep.
 *
 * Rejects on a new claim, and on growth: a section that came back materially
 * longer has almost certainly had something added, whatever the tokens say.
 */
export function vetTailored(
  before: string,
  after: string,
  fromSolicitation = "",
): TailorResult["rejected"] {
  const trimmed = after.trim();
  if (trimmed.length === 0) return "came back empty";
  if (trimmed.length > before.length * 1.4) {
    return `grew from ${before.length} to ${trimmed.length} characters, which is padding rather than tailoring`;
  }
  const added = newClaims(before, trimmed, fromSolicitation);
  if (added.length > 0) {
    return `introduced ${added.length} thing(s) the approved text does not say: ${added.slice(0, 6).join(", ")}`;
  }
  return undefined;
}
