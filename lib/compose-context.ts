import type { SupabaseClient } from "@supabase/supabase-js";
import { rankEngagements, type ComposeContext } from "./compose.ts";
import type { Database, RfpRow } from "@/lib/supabase/types";

/**
 * Everything a composed section is written from, gathered in one place.
 *
 * This used to live inside the server action that calls it, which meant
 * anything else needing the same context had to build its own copy: a local
 * test harness did exactly that, drifted from the original within a day, and
 * then reported the application as broken over fields the application was
 * passing correctly all along.
 *
 * One implementation, so a harness exercising the composer is exercising the
 * composer rather than a sketch of it.
 */

function capped(values: string[], limit: number, label: string): string[] {
  if (values.length > limit) {
    console.warn(`[compose] ${values.length - limit} of ${values.length} ${label} did not fit the prompt (cap ${limit}).`);
  }
  return values.slice(0, limit);
}

/** Wins first, then longest: a substantial block shows more of how the firm
 *  writes than a one-line one. Capped to leave the model room for the answer -
 *  twenty-two blocks of source produced a truncated response and a worse
 *  section than six did. */
const SOURCE_PER_SECTION = 6;

/**
 * Which compliance rules a writer needs first, when they do not all fit.
 *
 * Twelve of eighteen reach the prompt on a solicitation like Leesburg's, and
 * the twelve were whichever came first alphabetically. That dropped "Thirty
 * page maximum" - the constraint that bounds the entire document - while
 * keeping four signature forms the composer never writes a word about, because
 * "Acknowledgement of Addenda" sorts above "Thirty".
 *
 * Ordered by what a person writing prose actually has to obey. Manual forms are
 * last on purpose: they matter enormously to the bid and not at all to the
 * drafting, they are tracked on the checklist where they can be ticked, and
 * they are the safest thing to lose from a prompt.
 */
/**
 * Requirements that decide whether Caravann may bid, rather than what it would
 * do if it did.
 *
 * The composer is handed this list under the words "Build the plan around these
 * and nothing else", ordered by `is_required` then alphabetically by text. On
 * the Leesburg solicitation that put automobile insurance limits, cyber
 * liability and AM Best carrier ratings in the first four lines, ahead of every
 * requirement about leadership development, and left the model to write a
 * delivery plan from an insurance schedule.
 *
 * These are already on the compliance checklist, which is where they get
 * satisfied. They stay in the list because a proposal does sometimes need to
 * acknowledge them, and they go to the bottom of it because nothing in the
 * engagement is built out of them.
 */
const ELIGIBILITY_REQUIREMENT =
  /\b(insurance|liability|coverage|indemnif|insured|am best|workers.?comp|bond|surety|registr|registered|licen[cs]e|certificate|authorized to transact|eva\b|eprocurement|portal|submitted (through|via)|sam\.gov|uei|cage|w-?9|references?)\b/i;

const COMPOSER_PRIORITY = [
  "page_limit",
  "format",
  "rubric",
  "submission",
  "deadline",
  "insurance",
  "other",
  "manual_form",
];

export type ComposeBase = Omit<ComposeContext, "source">;

export type ComposeBundle = {
  base: ComposeBase;
  /** The approved library blocks for one section type, ranked and capped. */
  sourceFor: (sectionType: string) => ComposeContext["source"];
  team: ComposeBase["team"];
};

export async function buildComposeContext(
  supabase: SupabaseClient<Database>,
  rfpId: string,
  rfp: RfpRow,
): Promise<ComposeBundle> {
  const { data: library } = await supabase.from("language_blocks").select("section_type, title, body, won");

  const [{ data: checks }, { data: rules }, { data: gaps }, { data: assigned }, { data: roster }, { data: profile }, { data: engagements }, { data: amendments }, { data: solicitation }] =
    await Promise.all([
      supabase
        .from("rfp_disqualifier_checks")
        .select("requirement_text, is_required")
        .eq("rfp_id", rfpId)
        .order("is_required", { ascending: false })
        .order("requirement_text"),
      supabase.from("rfp_compliance_items").select("category, label, detail").eq("rfp_id", rfpId).order("label"),
      supabase.from("rfp_gap_items").select("description").eq("rfp_id", rfpId).order("description"),
      supabase.from("rfp_team_assignments").select("team_member_id").eq("rfp_id", rfpId).eq("status", "confirmed"),
      supabase.from("team_members").select("id, name, role, responsibilities, bio, credentials, years_experience"),
      supabase
        .from("org_profile")
        .select("capabilities, bilingual_staff, media_production_capable, pr_capable")
        .eq("id", true)
        .maybeSingle(),
      supabase.from("past_engagements").select("*"),
      supabase
        .from("rfp_related_documents")
        .select("title, sequence, body")
        .eq("rfp_id", rfpId)
        .eq("kind", "addendum")
        .order("sequence"),
      supabase
        .from("source_documents")
        .select("body")
        .eq("rfp_id", rfpId)
        .eq("kind", "solicitation")
        .maybeSingle(),
    ]);

  const byId = new Map((roster ?? []).map((m) => [m.id, m]));
  const team = (assigned ?? [])
    .map((a) => byId.get(a.team_member_id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({
      name: m.name,
      role: m.role,
      responsibilities: m.responsibilities,
      bio: m.bio,
      credentials: m.credentials,
      years_experience: m.years_experience,
    }));

  const sourceFor = (type: string) =>
    (library ?? [])
      .filter((b) => b.section_type === type)
      .sort((a, b) => Number(b.won) - Number(a.won) || (b.body?.length ?? 0) - (a.body?.length ?? 0))
      .slice(0, SOURCE_PER_SECTION)
      .map((b) => ({ title: b.title, body: b.body, won: Boolean(b.won) }));

  const base: ComposeBase = {
    agency: rfp.client_agency,
    title: rfp.title,
    solicitationNumber: rfp.solicitation_number,
    requirements: capped(
      [...(checks ?? [])]
        .filter((c) => c.requirement_text)
        // Capability first, eligibility last, and mandates ahead of preferences
        // within each. The database order is alphabetical, which is no order at
        // all for this purpose.
        .sort((a, b) => {
          const admin = (c: { requirement_text: string | null }) =>
            ELIGIBILITY_REQUIREMENT.test(c.requirement_text ?? "") ? 1 : 0;
          return admin(a) - admin(b) || Number(b.is_required) - Number(a.is_required);
        })
        .map((c) => `${c.is_required ? "[required] " : "[preferred] "}${c.requirement_text}`),
      14,
      "requirements",
    ),
    rules: capped(
      [...(rules ?? [])]
        .sort((a, b) => COMPOSER_PRIORITY.indexOf(a.category) - COMPOSER_PRIORITY.indexOf(b.category))
        .map((r) => [r.label, r.detail].filter(Boolean).join(": "))
        .filter(Boolean),
      12,
      "compliance rules",
    ),
    gaps: capped((gaps ?? []).map((g) => g.description).filter(Boolean) as string[], 8, "gaps"),
    solicitation: solicitation?.body ?? null,
    amendments: (amendments ?? [])
      .filter((a) => a.body)
      .map((a) => `${a.title ?? `Addendum ${a.sequence ?? ""}`.trim()}: ${a.body}`),
    team,
    capabilities: [
      ...(profile?.capabilities?.subject_areas ?? []),
      ...(profile?.capabilities?.key_capabilities ?? []),
    ].slice(0, 14),
    cannot: [
      profile?.bilingual_staff === false ? "bilingual English and Spanish delivery" : null,
      profile?.media_production_capable === false ? "media production" : null,
      profile?.pr_capable === false ? "public relations and communications" : null,
    ].filter((x): x is string => Boolean(x)),
    dueDate: rfp.due_at?.slice(0, 10) ?? null,
    budget: rfp.budget_amount,
    costWeight: rfp.cost_weight_percent ?? null,
    engagements: rankEngagements(
      engagements ?? [],
      [rfp.title, rfp.project_type, rfp.client_agency].filter(Boolean).join(" "),
    ),
  };

  return { base, sourceFor, team };
}
