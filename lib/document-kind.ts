/**
 * What kind of procurement document is this?
 *
 * Everything arriving at the desk was treated as a solicitation, which is wrong
 * for at least three of the things agencies actually send, and Khaled supplied
 * one of each:
 *
 *   · a **notice** from a posting board, where the RFP is an attachment named
 *     in the text rather than the text itself. Triaging the notice scores the
 *     advert, not the solicitation.
 *   · an **addendum**, which amends a solicitation already in the queue. One of
 *     his moves a deadline and deletes fifteen points of scoring weight.
 *   · a **clarifying-questions** document, which answers bidders' questions and
 *     routinely contradicts what the original said. One of his reverses a page
 *     limit that the desk would have recorded as a compliance item.
 *
 * The last two carry the solicitation number of the bid they belong to, so they
 * can be attached to it rather than becoming unrelated rows in the queue. That
 * is the whole point of detecting them: an addendum filed as its own bid is an
 * amendment nobody applies.
 *
 * Deliberately rules, not a model call. These documents announce themselves in
 * their first hundred words, in wording that has not changed in decades, and a
 * classification that runs before triage should not cost eighteen cents or wait
 * on a third party. What the rules cannot decide falls through to
 * "solicitation", which is the behaviour that exists today.
 */

export type DocumentKind = "solicitation" | "addendum" | "clarifying_questions" | "notice";

export type Classification = {
  kind: DocumentKind;
  /** The solicitation this amends or answers, when it names one. */
  solicitationNumber: string | null;
  /** Which amendment or answer set this is: Addendum 2 supersedes Addendum 1. */
  sequence: number | null;
  /** The named attachment holding the real document, for a notice. */
  attachmentName: string | null;
  /** What in the text decided it, so a wrong call can be argued with. */
  because: string;
};

/**
 * Solicitation numbers as agencies actually write them.
 *
 * Matched from a labelled context rather than anywhere in the page: "#2026-25"
 * next to the words REQUEST FOR PROPOSALS is a solicitation number, while the
 * same digits inside a street address are not.
 */
const NUMBER_PATTERNS: RegExp[] = [
  // Segments of letters or digits joined by hyphens, which covers 2026-25,
  // 2608-001, EBJPA-2026-07 and 27-S-S-003 alike. An earlier version required
  // the letters to come first and silently returned null for 27-S-S-003, which
  // is the format on the one real solicitation already in the queue.
  /(?:request\s+for\s+(?:proposals?|qualifications?)|rfp|rfq|ifb|rfi)\s*(?:number|no\.?)?\s*#?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+|\d{3,})/i,
  /solicitation\s*(?:id|number|no\.?|#)?\s*:?\s*#?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+|\d{3,})/i,
  /(?:contract|bid)\s*(?:number|no\.?|#)\s*:?\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)/i,
];

function solicitationNumber(text: string): string | null {
  const head = text.slice(0, 4000);
  for (const re of NUMBER_PATTERNS) {
    const m = head.match(re);
    if (m?.[1]) {
      const cleaned = m[1].trim().replace(/\s+/g, "").replace(/[.,;:]+$/, "");
      // A bare year is not an identifier. "RFP 2026" tells you nothing about
      // which 2026 solicitation, so it is worse than admitting ignorance.
      if (/^\d{4}$/.test(cleaned)) continue;
      if (cleaned.length >= 4) return cleaned;
    }
  }
  return null;
}

function sequence(text: string, word: string): number | null {
  const re = new RegExp(`${word}\\s*(?:number|no\\.?|#)?\\s*#?\\s*(\\d{1,2})`, "i");
  const m = text.slice(0, 3000).match(re);
  return m ? Number(m[1]) : null;
}

/**
 * Where a document first declares what it is.
 *
 * Position decides, not presence. Khaled's Q&A document contains the sentence
 * "This has been corrected in Addendum 1", and a rule that merely looked for
 * the word "addendum" filed a question-and-answer set as an amendment: the
 * exact mistake that would then apply changes the document never made. Both
 * kinds mention the other constantly, because they are issued in pairs against
 * the same solicitation. What separates them is that a document announces
 * itself in its own title block and only refers to its sibling later.
 */
function declaredAt(text: string, patterns: RegExp[]): number {
  let best = Infinity;
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.index !== undefined && m.index < best) best = m.index;
  }
  return best;
}

const ADDENDUM_SELF = [
  /\baddend(?:um|a)\s*(?:number|no\.?|#)?\s*#?\s*\d/i,
  /\bamendment\s*(?:number|no\.?|#)?\s*#?\s*\d/i,
  /\bis hereby (?:amended|changed)\b/i,
];

const QA_SELF = [
  /response\s+to\s+clarifying\s+questions?/i,
  /clarifying\s+questions?\s*#?\s*\d/i,
  /response\s+to\s+questions/i,
  /questions?\s*(?:and|&)\s*answers/i,
  /questions submitted by (?:interested|prospective)/i,
];

export function classifyDocument(text: string): Classification {
  const head = text.slice(0, 3000);
  const lower = head.toLowerCase();
  const number = solicitationNumber(text);

  const addendumAt = declaredAt(head, ADDENDUM_SELF);
  const qaAt = declaredAt(head, QA_SELF);

  if (qaAt < addendumAt && qaAt !== Infinity) {
    return {
      kind: "clarifying_questions",
      solicitationNumber: number,
      sequence: sequence(head, "clarifying questions") ?? sequence(head, "questions"),
      attachmentName: null,
      because: "answers questions submitted by bidders against a published solicitation",
    };
  }

  if (addendumAt !== Infinity) {
    return {
      kind: "addendum",
      solicitationNumber: number,
      sequence: sequence(head, "addend(?:um|a)") ?? sequence(head, "amendment"),
      attachmentName: null,
      because: "names itself an addendum or amendment to a published solicitation",
    };
  }

  // A notice is recognised by what it lacks: it advertises a solicitation and
  // names the file holding it, rather than containing one. The attachment line
  // is the tell, because a real RFP does not point at itself.
  // A hyphen counts, and so does nothing at all. Requiring a space or an
  // underscore after "RFP" missed RFP-2026-14.pdf and RFP2026-14.pdf, which
  // between them are most of how these files are actually named, so the notice
  // was recognised and then could not say where the real document was.
  // No spaces except the one that may follow "RFP", so the capture is the file
  // name rather than the sentence around it. Allowing spaces on both sides made
  // "The solicitation is attached as RFP-2026-14.pdf" capture the whole clause,
  // and that string then went on the record as the document to fetch.
  const attachment = head.match(/\b([A-Za-z0-9._-]*RFP[ _-]?[A-Za-z0-9._-]*\.pdf)/i);
  const postingBoard =
    /electronic state business daily|state business daily|bid ?board|bid ?net|planetbids|bonfire|demandstar|bidexpress|periscope|vendor ?registry|public ?purchase|sam\.gov/i.test(
      head,
    );
  // "attached", not only "attachment". A posting that says "the full
  // solicitation is attached as RFP-2026-14.pdf" is the commonest wording of
  // the commonest kind of notice, and the plural-only pattern read it as the
  // solicitation itself.
  const advertises = /\battach(?:ed|ment|ments|ing)\b/i.test(head) && Boolean(attachment);
  const lacksScope = !/\bscope of (?:work|services)\b/i.test(text) && text.length < 6000;

  if ((postingBoard || advertises) && lacksScope) {
    return {
      kind: "notice",
      solicitationNumber: number,
      sequence: null,
      attachmentName: attachment?.[1]?.trim() ?? null,
      because: postingBoard
        ? "a posting-board entry that advertises a solicitation rather than containing one"
        : "names an attachment holding the solicitation and states no scope of its own",
    };
  }

  return {
    kind: "solicitation",
    solicitationNumber: number,
    sequence: null,
    attachmentName: null,
    because: lower.includes("scope of work")
      ? "states its own scope of work"
      : "nothing marks it as an amendment, an answer set or a posting",
  };
}
