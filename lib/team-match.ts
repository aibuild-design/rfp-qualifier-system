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
const BANDWIDTH_WEIGHT: Record<TeamMemberRow["bandwidth"], number> = {
  open: 1,
  limited: 0.75,
  full: 0.4,
};

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
  const relevant = requirementTerms.filter(({ terms }) =>
    active.some((m) => {
      const hay = [...m.qualifications, m.role ?? ""]
        .join(" ")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map(fold)
        .join(" ");
      return terms.some((t) => hay.includes(t));
    })
  );
  const denominator = relevant.length ? relevant : requirementTerms;

  const scored = active.map((m) => {
    // Folded with the same function as the requirement terms - normalising one
    // side only would leave the mismatch exactly where it was.
    const haystack = [...m.qualifications, ...(m.interests ?? []), m.role ?? ""]
      .join(" ")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map(fold)
      .join(" ");

    const matched = denominator.filter(({ terms }) => terms.some((t) => haystack.includes(t)));

    // Normalised so a solicitation with many requirements doesn't inflate
    // everyone's score relative to one with few.
    const coverage = denominator.length ? matched.length / denominator.length : 0;
    // Interest is a tiebreak, not a qualification. Someone who wants this work
    // and can do it should come first between two equal candidates, but wanting
    // it can never lift someone above a person who is actually qualified - so it
    // moves the score by a few points rather than by a multiple.
    const wants = (m.interests ?? []).some((i) => {
      const terms = significantTerms(i);
      return terms.some((t) => haystack.includes(t)) || denominator.some((d) => d.terms.some((t) => i.toLowerCase().includes(t)));
    });
    const score = Math.round(coverage * 100 * BANDWIDTH_WEIGHT[m.bandwidth]) + (wants && matched.length > 0 ? 3 : 0);

    const reason = buildReason(matched.length, denominator.length, m);
    return { team_member_id: m.id, name: m.name, match_score: score, match_reason: reason };
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
  return scored
    .filter((p) => p.match_score > 0)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, limit);
}

function buildReason(matched: number, total: number, m: TeamMemberRow): string {
  const parts: string[] = [];
  parts.push(
    total === 0
      ? "No stated minimums extracted to match against"
      : `Matches ${matched} of ${total} stated requirement${total === 1 ? "" : "s"}`
  );
  if (m.qualifications.length) parts.push(`qualifications: ${m.qualifications.join(", ")}`);
  if (m.interests?.length) parts.push(`wants: ${m.interests.join(", ")}`);
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
