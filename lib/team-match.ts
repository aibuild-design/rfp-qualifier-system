import type { RfpDisqualifierCheckRow, TeamMemberRow } from "@/lib/supabase/types";

export type TeamRecommendation = {
  team_member_id: string;
  name: string;
  match_score: number;
  match_reason: string;
};

// Bandwidth is a tie-breaker, not a gate - the SOW recommends, it never
// auto-assigns, so someone at capacity should still surface if they are the
// only person who satisfies a stated minimum. Khaled decides.
//
// It used to be a multiplier, which is not a tie-breaker at all. Multiplying by
// 0.4 lets a 45% match who is free outrank a perfect match who is busy, and on
// East Bay it did something worse: Khaled is the lead facilitator with strategic
// planning on his own profile, he matched every relevant requirement, and
// "limited" scaled him to 78 while three people at 100% coverage of a thinner
// overlap sat above him at 103. The one name that had to be on that list was
// pushed off it by a calendar.
//
// A subtraction instead. Eight points is enough to order two people who are
// otherwise equal and far too small to reorder people who are not.
const BANDWIDTH_PENALTY: Record<TeamMemberRow["bandwidth"], number> = {
  open: 0,
  limited: 4,
  full: 8,
};
const BANDWIDTH_RANK: Record<TeamMemberRow["bandwidth"], number> = { open: 0, limited: 1, full: 2 };

/**
 * Ranks the roster against a solicitation's stated requirements.
 *
 * Deliberately keyword-based rather than a model call: the roster is small,
 * the qualifications are short phrases Khaled wrote himself, and a
 * recommendation that can be explained in one line ("satisfies 2 of 3 stated
 * minimums") is more useful than an opaque score. The reason string is the
 * point - an unexplained ranking is not something anyone should act on.
 */
export function recommendTeam(
  members: TeamMemberRow[],
  checks: Pick<RfpDisqualifierCheckRow, "requirement_text" | "is_required">[],
  limit = 3
): TeamRecommendation[] {
  const active = members.filter((m) => m.active);
  if (active.length === 0) return [];

  const required = checks.filter((c) => c.is_required);
  const requirementTerms = (required.length ? required : checks).map((c) => ({
    text: c.requirement_text,
    terms: significantTerms(c.requirement_text),
  }));

  // Score only against requirements a PERSON could satisfy.
  //
  // The gate checks every stated requirement, and most of them are about the
  // document rather than the team: a twenty-page limit, a W-9, a certificate of
  // insurance, registration in Oregon. Dividing by all nine meant the best
  // consultant on the roster could reach 11% - "matches 1 of 9" - which reads
  // as "nobody here is suitable" when the truth is that eight of those nine
  // were never about suitability.
  //
  // Rather than a keyword list of what counts as a people requirement, which
  // would need maintaining for every agency's phrasing, the denominator is the
  // set of requirements at least one active member matches. A page limit
  // matches nobody and drops out on its own; a facilitation requirement matches
  // several and stays. Falls back to the full set when nothing matches at all,
  // so a roster with no overlap still scores 0 rather than dividing by zero.
  // How much any one word is worth, measured against this roster.
  //
  // Every word was worth the same, and in this domain that is the whole
  // problem: "development", "executive" and "organizational" appear across most
  // of the roster and most of the requirements, so matching on one of them said
  // nothing and everyone tied. "Leadership" belongs to one person, "management"
  // to one, "virginia" to nobody - those are the words that actually separate
  // candidates.
  //
  // Standard inverse document frequency over the fourteen profiles. A term the
  // whole roster shares is worth zero, which is the correct value for it.
  const capability = new Map(active.map((m) => [m.id, capabilityText(m)]));
  const documentFrequency = new Map<string, number>();
  for (const { terms } of requirementTerms) {
    for (const t of terms) {
      if (documentFrequency.has(t)) continue;
      documentFrequency.set(t, active.filter((m) => (capability.get(m.id) ?? "").includes(t)).length);
    }
  }
  //
  // Smoothed with N+1 on top rather than N. Plain log(N/(1+df)) hits zero the
  // moment df reaches N-1, which on a two-person roster is any term one of them
  // has - every weight collapses to zero and the matcher recommends nobody.
  // That is not a hypothetical: it is what the unit fixtures are, and it is
  // what a small firm's roster looks like before it grows.
  const informativeness = (t: string) =>
    Math.max(0, Math.log((active.length + 1) / (1 + (documentFrequency.get(t) ?? 0))));

  /** Share of a requirement's information a person covers, 0 to 1. */
  const strengthOf = (terms: string[], haystack: string): number => {
    if (terms.length === 0) return 0;
    let total = 0;
    let met = 0;
    for (const t of terms) {
      const w = informativeness(t);
      total += w;
      if (w > 0 && haystack.includes(t)) met += w;
    }
    // Every term in this requirement is one the whole roster shares, so
    // weighting cannot separate anybody on it. Falling back to counting terms
    // keeps a real match visible; without this a one-person roster scores zero
    // on requirements it plainly satisfies, because with one person every term
    // is universal by definition.
    if (total === 0) {
      return terms.filter((t) => haystack.includes(t)).length / terms.length;
    }
    return met / total;
  };

  const relevant = requirementTerms.filter(({ terms }) =>
    active.some((m) => strengthOf(terms, capability.get(m.id) ?? "") > 0)
  );
  const denominator = relevant.length ? relevant : requirementTerms;

  const scored = active.map((m) => {
    // Folded with the same function as the requirement terms - normalising one
    // side only would leave the mismatch exactly where it was.
    // Qualifications and role only.
    //
    // Interests were in here, so wanting a kind of work created matches - the
    // comment below says wanting it "can never lift someone above a person who
    // is actually qualified", and it silently did, because an interest counted
    // as evidence exactly like a qualification. It is a tiebreak, and the +3 at
    // the bottom is the whole of its influence.
    const haystack = capability.get(m.id) ?? "";

    // How much of each requirement this person covers, not merely whether one
    // word landed.
    //
    // A hit was all-or-nothing, and the relevance filter routinely leaves one
    // or two requirements standing, so the score became binary: everyone who
    // touched a single word scored 100 and tied. On the East Bay solicitation
    // that produced three people on exactly 103, and the top three were the
    // first three the database happened to return - a graphic recorder among
    // them, on a strategic planning job.
    //
    // Depth breaks those ties on evidence rather than on row order. Matching
    // "facilitating executive leadership teams and elected or appointed
    // governing bodies" on six of its terms is a different claim from matching
    // it on the word "executive", and the ranking can now tell them apart.
    const strengths = denominator.map(({ terms }) => strengthOf(terms, haystack));
    const matched = denominator.filter((_, i) => strengths[i] > 0);

    // Normalised so a solicitation with many requirements doesn't inflate
    // everyone's score relative to one with few.
    const coverage = denominator.length ? matched.length / denominator.length : 0;
    // Averaged over the requirements this person actually matched, not over all
    // of them. Spreading it across the whole list divided the one real signal in
    // the data by five and left every candidate within two points of the next -
    // close enough that a bandwidth adjustment decided the ranking. How deeply
    // someone covers the requirements they meet is a fact about those
    // requirements; the ones they missed are already counted, once, in coverage.
    const hitStrengths = strengths.filter((x) => x > 0);
    const precision = hitStrengths.length
      ? hitStrengths.reduce((a, b) => a + b, 0) / hitStrengths.length
      : 0;
    // Breadth still leads - satisfying four requirements shallowly beats
    // satisfying one deeply, because the agency listed four.
    const fit = 0.65 * coverage + 0.35 * precision;

    // Interest is a tiebreak, not a qualification. Someone who wants this work
    // and can do it should come first between two equal candidates, but wanting
    // it can never lift someone above a person who is actually qualified - so it
    // moves the score by a few points rather than by a multiple.
    const wants = (m.interests ?? []).some((i) => {
      const terms = significantTerms(i);
      return terms.some((t) => haystack.includes(t)) || denominator.some((d) => d.terms.some((t) => i.toLowerCase().includes(t)));
    });

    // Clamped, because this is displayed as a percentage beside a person's name.
    // The interest bonus on top of full coverage produced 103, which is not a
    // score anyone can interpret.
    const raw = Math.round(fit * 100) + (wants && matched.length > 0 ? 3 : 0) - BANDWIDTH_PENALTY[m.bandwidth];
    const score = Math.max(0, Math.min(100, raw));

    const reason = buildReason(matched.length, denominator.length, m);
    return {
      team_member_id: m.id,
      name: m.name,
      match_score: score,
      match_reason: reason,
      coverage: matched.length,
      bandwidthRank: BANDWIDTH_RANK[m.bandwidth],
    };
  });

  // A zero means no stated requirement touched anything this person does. Three
  // zeroes side by side still read as "here is your team" - and that is exactly
  // what happened on a solicitation whose only extracted requirements were the
  // gate reporting it could not read the document ("Full solicitation must be
  // available to assess requirements"). Nobody matches that, everyone tied at
  // zero, and the first three names alphabetically were presented as the
  // recommendation: a coach and a happiness researcher for an organizational
  // development job.
  //
  // Recommending nobody is the honest output there. The panel says it has
  // nothing to go on, which is true and actionable - get the real document -
  // where three arbitrary names are neither.
  // Ordered all the way down, so the same roster and the same solicitation
  // always produce the same three names. Ranking on score alone left ties to be
  // resolved by whatever order Postgres returned the roster in, which is not a
  // decision anyone made.
  return scored
    .filter((p) => p.match_score > 0)
    .sort(
      (a, b) =>
        b.match_score - a.match_score ||
        b.coverage - a.coverage ||
        a.bandwidthRank - b.bandwidthRank ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit)
    .map(({ team_member_id, name, match_score, match_reason }) => ({ team_member_id, name, match_score, match_reason }));
}

function buildReason(matched: number, total: number, m: TeamMemberRow): string {
  const parts: string[] = [];
  parts.push(
    total === 0
      ? "No stated minimums extracted to match against"
      : `Matches ${matched} of ${total} stated requirement${total === 1 ? "" : "s"}`
  );
  // The evidence, which is qualifications and role together - the two things
  // the score is now computed from. Four of the fourteen have an empty
  // qualifications array and are matched entirely on their role, and the reason
  // for those read "Matches 3 of 5 stated requirements · bandwidth open",
  // naming nothing about the person at all.
  const evidence = [...m.qualifications];
  if (m.role && !evidence.some((q) => q.toLowerCase() === m.role?.toLowerCase())) evidence.push(m.role);
  if (evidence.length) parts.push(`on file: ${evidence.join(", ")}`);
  // Listed after the evidence and labelled as a preference, because it is one.
  // Shown above in the same breath as qualifications, it read as though wanting
  // the work was part of why the person was picked.
  if (m.interests?.length) parts.push(`would like: ${m.interests.join(", ")}`);
  parts.push(
    m.bandwidth === "open"
      ? "bandwidth open"
      : m.bandwidth === "limited"
        ? "bandwidth limited"
        : "currently at capacity"
  );
  return parts.join(" · ");
}

// Words too generic to indicate a real capability match. Without this,
// "experience" and "services" appear in nearly every requirement and every
// roster entry, so everyone scores identically and the ranking says nothing.
const STOPWORDS = new Set([
  "the", "and", "for", "with", "minimum", "years", "year", "experience", "least",
  "must", "shall", "should", "have", "has", "including", "such", "that", "this",
  "from", "within", "provide", "providing", "services", "service", "evidence",
  "demonstrated", "similar", "preferred", "required", "team", "member", "least",
  "three", "five", "one", "two", "four", "prior", "work", "related", "able",
]);

/**
 * Folds the spelling and inflection differences that stopped this matcher
 * working at all.
 *
 * The roster is written in British English - Khaled's own phrasing,
 * "Organisational development" - and American agencies write "organizational".
 * A substring test never fires across that one letter, so the single most
 * common word in this domain matched nothing. Likewise "facilitating" in a
 * solicitation against "facilitation" on the roster.
 *
 * Both are folded to a common form before comparison: -ise/-isation become
 * -ize/-ization, then a crude suffix strip collapses the inflections. Cheap,
 * and it only has to be right about this vocabulary.
 */
function fold(word: string): string {
  const z = word.replace(/isation/g, "ization").replace(/ise\b/g, "ize").replace(/ised\b/g, "ized").replace(/ising\b/g, "izing");
  return z.length > 5 ? z.replace(/(ations|ation|ings|ing|ors|or|ers|er|es|s)$/, "") : z;
}

/** Folded, punctuation-free, space-joined - the one form both sides compare in. */
function normalise(parts: string[]): string {
  return parts
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map(fold)
    .join(" ");
}

/** What a person can actually do. Interests are deliberately excluded here:
 *  wanting a kind of work is a tiebreak between qualified people, never the
 *  evidence that a requirement is the sort a person could satisfy. */
function capabilityText(m: TeamMemberRow): string {
  return normalise([...m.qualifications, m.role ?? ""]);
}

function significantTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w))
        .map(fold)
    )
  );
}
