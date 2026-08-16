/**
 * Which emails count as a solicitation.
 *
 * The defaults are the five terms that were hardcoded in the Gmail trigger. They
 * stay the defaults because they are what a public agency actually writes; the
 * point of making them editable is the sixth term, not replacing these five.
 */
export const DEFAULT_SUBJECT_TERMS = [
  "RFP",
  "RFQ",
  "solicitation",
  "request for proposal",
  "request for qualifications",
] as const;

/**
 * Substrings that disqualify an email even when it matched.
 *
 * Only meaningful once the body is being read: a subject line is short enough
 * that a false positive is rare, but a body is long and full of other people's
 * words, and a procurement newsletter mentioning an RFP in passing costs the
 * same to triage as a real one.
 */
export const DEFAULT_IGNORE_TERMS = [
  "unsubscribe from",
  "webinar",
  "newsletter",
  "survey invitation",
] as const;

export type IntakeFilter = {
  terms: readonly string[];
  ignoreTerms: readonly string[];
  /** Match the qualifying terms against the body too. The subject always counts. */
  matchBody: boolean;
};

function contains(haystack: string, terms: readonly string[]): boolean {
  return terms.some((t) => {
    const needle = t.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * Does this email look like a solicitation?
 *
 * Case-insensitive substring, not word matching: "RFP No. 2026-14" and
 * "Re: RFP/RFQ opportunities" both count, and an agency that writes "RFPs" is
 * not excluded by a word boundary nobody thought about.
 *
 * An empty term list means everything qualifies. That is a real setting - "let
 * me see it all and I will judge" - and treating it as "match nothing" would
 * turn a deliberate choice into a silent outage.
 *
 * The ignore list is checked last and against subject and body together, so it
 * wins whatever matched and wherever the match came from. A rule that says
 * "never this" has to be able to overrule a rule that says "always that", or it
 * is not really an exclusion.
 */
export function emailQualifies(
  email: { subject?: string | null; body?: string | null },
  filter: IntakeFilter,
): boolean {
  const subject = (email.subject ?? "").toLowerCase();
  const body = (email.body ?? "").toLowerCase();

  if (contains(`${subject}\n${body}`, filter.ignoreTerms)) return false;
  if (filter.terms.length === 0) return true;

  return contains(filter.matchBody ? `${subject}\n${body}` : subject, filter.terms);
}
