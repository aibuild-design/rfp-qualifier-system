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
 * Deliberately empty.
 *
 * The obvious defaults - unsubscribe, newsletter, webinar - are reasoned from a
 * general inbox that happens to receive solicitations. This is a dedicated
 * address whose main traffic is aggregator alerts, and almost every one of
 * those carries "unsubscribe from" in its footer. Since the ignore list is
 * matched against the body too, those defaults would have dropped the mail the
 * desk exists to catch, silently, because an email that never matches is never
 * fetched and a missed opportunity looks exactly like a quiet week.
 *
 * The mechanism is worth having and costs nothing sitting unused. Guessing at
 * its contents before seeing the mail is what was wrong.
 *
 * The phrase most likely to earn a place here, once real mail confirms it, is
 * "does not constitute a solicitation": it appears in the footer of a great deal
 * of financial and legal email and never in a solicitation Caravann would bid.
 * It is not a default because nobody has yet watched a week of this inbox.
 */
export const DEFAULT_IGNORE_TERMS: readonly string[] = [];

/**
 * Mail the desk sent itself.
 *
 * Matched on the marker in the subject rather than the sender, because the
 * verdict notification is sent from the same account it is delivered to, so the
 * sender cannot tell them apart. Without this the desk triages its own verdict
 * emails, which mention the solicitation by name and therefore always qualify.
 */
const SELF_SENT = /^\s*Caravann RFP Desk/i;

export type IntakeFilter = {
  terms: readonly string[];
  ignoreTerms: readonly string[];
  /** Match the qualifying terms against the body too. Subject and attachment
   *  names always count. */
  matchBody: boolean;
};

export type IntakeEmail = {
  subject?: string | null;
  body?: string | null;
  /** File names of anything attached. Often the only place the solicitation is
   *  named: an agency mails "Please see attached" with
   *  `RFP No. 100120-FY27-09.pdf` on it. */
  attachments?: readonly (string | null | undefined)[] | null;
};

/**
 * A term matches where a word starts with it, not wherever the letters appear.
 *
 * Plain substring let "surfperch" through as an RFP, because su-rfp-erch
 * contains the letters. That is the silly end of it. The costly end is that
 * every false positive downloads a document and pays for three model reads.
 *
 * Anchored at the front of a word and open at the back, which keeps the two
 * behaviours that were actually wanted: "RFP" still matches "RFPs" and "RFP:",
 * and someone who adds "procure" still catches "procurement". Only the mid-word
 * accident goes away.
 */
function contains(haystack: string, terms: readonly string[]): boolean {
  return terms.some((t) => {
    const needle = String(t ?? "").trim().toLowerCase();
    if (needle.length === 0) return false;
    // Terms are Khaled's to write, so they are escaped rather than trusted as a
    // pattern. A stray bracket in a term should narrow the search, not throw.
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // \b before a term starting with a non-word character never fires, so those
    // fall back to a plain substring test.
    const boundary = /^[a-z0-9]/.test(needle) ? "\\b" : "";
    return new RegExp(`${boundary}${escaped}`, "i").test(haystack);
  });
}

/** Subject and attachment names: how the email announces what it is. */
function identityOf(email: IntakeEmail): string {
  const names = (email.attachments ?? [])
    .map((n) => String(n ?? "").trim())
    .filter(Boolean)
    .join("\n");
  return `${email.subject ?? ""}\n${names}`.toLowerCase();
}

/**
 * Does this email look like a solicitation?
 *
 * Three fields, and they are not equal. The subject and the attachment names
 * are how an email says what it is, and they are matched always. Agencies
 * routinely send "Please see attached" with the solicitation number on the file
 * rather than in the subject, and reading the subject alone missed every one of
 * those silently, which looks exactly like a quiet week.
 *
 * The body is opt-in, because the generic terms behave differently there. Any
 * financial or legal footer can carry "this does not constitute a solicitation",
 * and matching that as a qualifying term pulls in statements and newsletters.
 *
 * An empty term list means everything qualifies. That is a real setting - "let
 * me see it all and I will judge" - and treating it as "match nothing" would
 * turn a deliberate choice into a silent outage.
 *
 * The ignore list is checked first and wins whatever matched, because a rule
 * that says "never this" has to be able to overrule a rule that says "always
 * that". It reads exactly the same text the qualifying terms read, including the
 * body when body matching is on: scoping it more narrowly leaves a class of
 * false positive that nothing can exclude. A monthly statement whose footer says
 * "this does not constitute a solicitation" qualifies on that footer, and if the
 * ignore list cannot see the body there is no setting that will stop it.
 *
 * That symmetry is safe only because the defaults are empty. See
 * DEFAULT_IGNORE_TERMS: an ignore term matched against the body is a loaded gun,
 * and the answer is not to disarm the mechanism but to refuse to guess at its
 * contents before seeing the mail.
 */
export function emailQualifies(email: IntakeEmail, filter: IntakeFilter): boolean {
  const subject = String(email.subject ?? "");
  if (SELF_SENT.test(subject)) return false;

  const identity = identityOf(email);
  const haystack = filter.matchBody
    ? `${identity}\n${String(email.body ?? "").toLowerCase()}`
    : identity;

  if (contains(haystack, filter.ignoreTerms)) return false;
  if (filter.terms.length === 0) return true;
  return contains(haystack, filter.terms);
}
