/**
 * Which subject lines count as a solicitation.
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
 * Does this subject look like a solicitation?
 *
 * Case-insensitive substring, not word matching: "RFP No. 2026-14" and
 * "Re: RFP/RFQ opportunities" both count, and an agency that writes "RFPs" is
 * not excluded by a word boundary nobody thought about.
 *
 * An empty list means everything qualifies. That is a real setting - "let me
 * see it all and I will judge" - and treating it as "match nothing" would turn
 * a deliberate choice into a silent outage.
 */
export function subjectQualifies(subject: string, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = (subject ?? "").toLowerCase();
  return terms.some((t) => {
    const needle = t.trim().toLowerCase();
    return needle.length > 0 && haystack.includes(needle);
  });
}
