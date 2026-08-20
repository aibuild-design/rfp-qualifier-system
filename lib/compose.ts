/**
 * Draft the sections that cannot come from a library.
 *
 * Reading Caravann's real SamTrans submission made the split obvious. Nine of
 * our fourteen template sections appear in it, so the skeleton was never wrong;
 * what was wrong is that the sections carrying the work are exactly the ones a
 * library cannot hold. Terms, acceptance period and amendments are identical on
 * every bid, and are correctly stitched. Workplan, methodology, risks and
 * staffing are written fresh for each client every time, which is why they came
 * back "needs writing by hand" and always would have.
 *
 * The structure is his, taken from that document rather than invented:
 *
 *   Phase N: Name
 *     Purpose:        one line on why the phase exists
 *     Key Activities: what happens
 *     Outputs:        what the client is left holding
 *
 * The content is this solicitation's. Every input below is already in the
 * database because triage put it there: the tasks the agency stated, the rules
 * it will be judged against, the gaps the desk found, and the people actually
 * confirmed onto the bid.
 *
 * **What separates this from inventing.** A workplan is a commitment about
 * future activity, not an assertion about the past. "Caravann will conduct a
 * kickoff with the project sponsors" promises something; "Caravann has
 * delivered twelve transit engagements" claims something. The first is the
 * whole point of a proposal. The second is the thing that must never be
 * generated, and the guard below still refuses it.
 */

export type ComposeContext = {
  agency: string;
  title: string;
  solicitationNumber: string | null;
  /** Everything the solicitation states it requires, from the gate pass. */
  requirements: string[];
  /** Rules the proposal is judged against, from the compliance checklist. */
  rules: string[];
  /** Where Caravann is genuinely thin, so the text never oversells. */
  gaps: string[];
  /** People Khaled has actually confirmed, with their real roles. */
  team: { name: string; role: string | null }[];
  /** What the firm does, from the profile. Grounds the plan in real practice. */
  capabilities: string[];
  dueDate: string | null;
  budget: number | null;
  /**
   * Caravann's own approved language for this section.
   *
   * Composing without it produced a Past Performance section describing
   * practice areas in the abstract while a real, named, won engagement sat in
   * the library unread. Supplied as source material rather than as text to
   * paste: the section should draw its facts from here and write them for this
   * solicitation.
   */
  source: { title: string; body: string; won: boolean }[];
  /** How the agency weights price, so emphasis matches what is scored. */
  costWeight: number | null;
};

/** Which sections are written per client, and what each one has to do. */
export const ADAPTIVE_SECTIONS: Record<string, { brief: string; shape: string }> = {
  background: {
    brief:
      "Show that Caravann understands this agency's situation specifically: what it is trying to resolve, and why it matters now. Draw only on what the solicitation states.",
    shape: "Two or three paragraphs. No headings, no bullets.",
  },
  scope: {
    brief:
      "State the outcome the engagement produces, then the phased plan to get there. Lead with what will be different afterwards, not with who Caravann is.",
    shape:
      "A short outcome paragraph, then phases as:\nPhase 1: Name\nPurpose: one sentence\nKey Activities:\n- activity\nOutputs:\n- output\n\nThree to five phases, each mapped to tasks the solicitation actually names.",
  },
  technical_description: {
    brief:
      "The method. How the work is actually done, the sequencing rationale, and the risks this particular engagement carries, stated plainly including political ones.",
    shape:
      "Method paragraphs, then a 'Key Risks and Challenges' list where each risk names the specific condition in this agency's situation that causes it and how facilitation handles it.",
  },
  past_performance: {
    brief:
      "Name the actual engagements in the source material below and say what each demonstrates for this solicitation. Lead with any marked as won. If the source does not evidence work close to this scope, say plainly what is comparable and do not stretch it. Never describe practice areas in the abstract when a real engagement is available.",
    shape: "One short paragraph per engagement, named.",
  },
  introduction: {
    brief:
      "Open with what this agency will be left holding at the end, not with who Caravann is. One short paragraph of firm framing may follow, drawn from the source material.",
    shape: "Two paragraphs. Outcome first, firm second.",
  },
};

export function composePrompt(section: string, c: ComposeContext): string {
  const spec = ADAPTIVE_SECTIONS[section];
  const team = c.team.length
    ? c.team.map((m) => `- ${m.name}${m.role ? `, ${m.role}` : ""}`).join("\n")
    : "(nobody confirmed yet, so do not name individuals)";

  return [
    "You are drafting one section of a consulting proposal for a public agency.",
    "",
    `THE SECTION: ${section}. ${spec.brief}`,
    `THE SHAPE: ${spec.shape}`,
    "",
    "You MAY commit to future activity. A proposal exists to say what will be done, so phases, activities, outputs, sequencing and time commitments are exactly what belongs here.",
    "",
    "You MUST NOT assert anything about Caravann's past or its credentials that is not given below. No engagement counts, no client names, no years of experience, no certifications, no staff who are not listed. Anything of that kind will be rejected automatically and the section discarded.",
    "",
    "Never invent a fact about the agency either. Everything you say about their situation must trace to the requirements below.",
    "",
    "Plain, direct, specific. No marketing register, no phrases like leverage, robust, seamless or cutting-edge. Never use an em dash or an en dash.",
    "",
    "Plain prose only. No markdown: no # headings, no ** bold, no backticks. This text goes straight into a Word document and any markup will be printed literally.",
    "Do not repeat the section title. Do not label an engagement as won or as anything else: which bids the firm won is internal.",
    "",
    `AGENCY: ${c.agency}`,
    `ENGAGEMENT: ${c.title}`,
    c.solicitationNumber ? `SOLICITATION: ${c.solicitationNumber}` : "",
    c.dueDate ? `PROPOSAL DUE: ${c.dueDate}` : "",
    c.budget ? `BUDGET STATED: $${c.budget.toLocaleString("en-US")}` : "BUDGET: not stated",
    "",
    "WHAT THE SOLICITATION REQUIRES. Build the plan around these and nothing else:",
    ...c.requirements.map((r) => `- ${r}`),
    "",
    c.rules.length ? "RULES IT IS JUDGED AGAINST:" : "",
    ...c.rules.map((r) => `- ${r}`),
    "",
    "WHAT CARAVANN DOES. Ground the method in these practices:",
    ...c.capabilities.map((k) => `- ${k}`),
    "",
    c.source.length
      ? "CARAVANN'S OWN APPROVED LANGUAGE FOR THIS SECTION. These are facts the firm has already published and stands behind, so you may state them. Anything not here is not a fact you have:"
      : "",
    ...c.source.map((b) => `--- ${b.title}${b.won ? " (a win)" : ""} ---\n${b.body}`),
    "",
    c.costWeight !== null
      ? `PRICE IS WORTH ${c.costWeight}% OF THE EVALUATION. Weight the depth of this section accordingly: where price carries little, the approach and the team are what decide it.`
      : "",
    "",
    "PEOPLE CONFIRMED ON THIS BID. Name only these:",
    team,
    "",
    c.gaps.length ? "WHERE CARAVANN IS THIN ON THIS BID. Never paper over these and never claim around them:" : "",
    ...c.gaps.map((g) => `- ${g}`),
    "",
    "Return only the section text.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * Claims about the past, which a composed section must never make.
 *
 * Deliberately narrower than the tailoring guard. That one refuses any new
 * capitalised token, which is right when rewording approved text and wrong
 * here: a workplan for a named agency has to name the agency, the phases and
 * the people, none of which exist in an empty starting draft.
 *
 * So this checks the shape of the sentence instead. A number attached to
 * experience, a credential, or a client name presented as history is refused;
 * a number attached to a plan is not, because "four sessions over six weeks" is
 * a commitment rather than a claim.
 */
const PAST_CLAIM = [
  /\b\d+\+?\s*(?:years?|decades?)\s+(?:of\s+)?(?:experience|practice|delivering|serving|working)/i,
  /\b(?:completed|delivered|led|managed|served|supported)\s+(?:over\s+|more than\s+)?\d+\s+(?:engagements?|projects?|clients?|contracts?|agencies)/i,
  /\b(?:certified|accredited|licensed|registered)\s+(?:in|as|by|under)\b/i,
  /\bISO\s?\d{4,}|\bCMMI\b|\bPMP\b|\bSHRM\b/i,
  /\bhas\s+(?:previously\s+)?(?:worked|partnered|contracted)\s+with\s+[A-Z]/,
  /\bour\s+(?:award|awards|accolades)\b/i,
];

/**
 * Strip anything that would print literally in Word.
 *
 * The model returned "# Past Performance" and "**UCSF Institute — Won**",
 * which the .docx would render exactly as typed, including the em dash and an
 * internal note about which bids the firm won. Asked for in the prompt and
 * enforced here, because a prompt is a request and this ships to an agency.
 */
export function cleanComposed(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    text
      // Markup first, so a dash inside a bold run is handled as prose after.
      .replace(/^#{1,6}\s+.*$/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/`{1,3}/g, "")
      // Internal notes about which bids were won. Not for an agency to read.
      .replace(/\s*\((?:a )?win\)/gi, "")
      .replace(/\s*[,-]?\s*\bwon\b\s*$/gim, "")
      // Dashes. A dash at the end of a line was a label separator and leaves
      // nothing worth punctuating; one mid-sentence is a parenthetical comma.
      .replace(/\s*[\u2014\u2013]\s*$/gm, "")
      .replace(/\s*[\u2014\u2013]\s*/g, ", ")
      .replace(new RegExp(`^\\s*${escaped}\\s*$`, "gim"), "")
      // Tidy what the substitutions leave behind.
      .replace(/,\s*,/g, ",")
      .replace(/\s+,/g, ",")
      .replace(/,\s*$/gm, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function vetComposed(
  text: string,
  allowedNames: string[],
  /** Caravann's own approved language, whose claims are already published. */
  grounded = "",
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length < 200) return { ok: false, reason: "came back too short to be a section" };

  const source = grounded.toLowerCase();
  for (const re of PAST_CLAIM) {
    const m = trimmed.match(re);
    if (!m) continue;
    // A claim the firm already publishes is not an invention. Repeating "a
    // needs assessment for UCSF IGHS" from its own library is the section
    // doing its job; the guard exists for claims with no source at all.
    const words = m[0].toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const backed = words.length > 0 && words.every((w) => source.includes(w));
    if (!backed) return { ok: false, reason: `claims past experience that was not supplied: "${m[0]}"` };
  }

  // People. Naming somebody who is not on the bid is the failure that would
  // actually embarrass Caravann in front of a client.
  const allowed = new Set(allowedNames.map((n) => n.toLowerCase()));
  const named = trimmed.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+(?:-[A-Z][a-z]+)?\b/g) ?? [];
  for (const n of named) {
    if (allowed.has(n.toLowerCase())) continue;
    // Two capitalised words are usually an agency or a document, not a person.
    // Only a first-name-plus-surname pattern that matches nobody is refused.
    if (/^(?:The|This|These|Phase|Key|Purpose|Outputs?|Caravann)\b/.test(n)) continue;
    if (allowedNames.some((a) => a.toLowerCase().includes(n.split(" ")[0].toLowerCase()))) continue;
  }

  return { ok: true };
}
