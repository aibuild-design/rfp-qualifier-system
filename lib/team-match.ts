import type { RfpDisqualifierCheckRow, TeamMemberRow } from "@/lib/supabase/types";

export type TeamRecommendation = {
  team_member_id: string;
  name: string;
  match_score: number;
  match_reason: string;
};

// Bandwidth is a tie-breaker, not a gate — the SOW recommends, it never
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
 * point — an unexplained ranking is not something anyone should act on.
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

  const scored = active.map((m) => {
    const quals = m.qualifications.map((q) => q.toLowerCase());
    const roleText = (m.role ?? "").toLowerCase();
    const haystack = [...quals, roleText].join(" ");

    const matched = requirementTerms.filter(({ terms }) =>
      terms.some((t) => haystack.includes(t))
    );

    // Normalised so a solicitation with many requirements doesn't inflate
    // everyone's score relative to one with few.
    const coverage = requirementTerms.length ? matched.length / requirementTerms.length : 0;
    const score = Math.round(coverage * 100 * BANDWIDTH_WEIGHT[m.bandwidth]);

    const reason = buildReason(matched.length, requirementTerms.length, m);
    return { team_member_id: m.id, name: m.name, match_score: score, match_reason: reason };
  });

  return scored.sort((a, b) => b.match_score - a.match_score).slice(0, limit);
}

function buildReason(matched: number, total: number, m: TeamMemberRow): string {
  const parts: string[] = [];
  parts.push(
    total === 0
      ? "No stated minimums extracted to match against"
      : `Matches ${matched} of ${total} stated requirement${total === 1 ? "" : "s"}`
  );
  if (m.qualifications.length) parts.push(`qualifications: ${m.qualifications.join(", ")}`);
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

function significantTerms(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    )
  );
}
