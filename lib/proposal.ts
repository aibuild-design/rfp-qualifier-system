import type { LanguageBlockRow, RfpRow } from "@/lib/supabase/types";
import { DISPLAY_TIME_ZONE } from "./rfp.ts";

// The sections a facilitation/strategic-planning response is normally
// required to carry. A real solicitation states its own required sections;
// once the compliance pass extracts those reliably this list becomes the
// fallback rather than the source of truth.
export const DEFAULT_SECTIONS = [
  { section_type: "cover_letter", heading: "Cover Letter", sort_order: 10 },
  { section_type: "firm_profile", heading: "Firm Profile and Qualifications", sort_order: 20 },
  { section_type: "relevant_experience", heading: "Relevant Experience", sort_order: 30 },
  { section_type: "approach", heading: "Approach and Methodology", sort_order: 40 },
  { section_type: "work_plan", heading: "Scope of Work and Deliverables", sort_order: 50 },
  { section_type: "team", heading: "Project Team and Key Personnel", sort_order: 60 },
  { section_type: "references", heading: "References", sort_order: 70 },
  { section_type: "cost", heading: "Cost Proposal", sort_order: 80 },
] as const;

/** Ranking the SOW is explicit about: proven winners outrank boilerplate.
 *  Boilerplate still sorts high within its own section because it is meant to
 *  be inserted verbatim - it just never displaces a block that came from a win. */
export function rankBlocks(blocks: LanguageBlockRow[]): LanguageBlockRow[] {
  return [...blocks].sort((a, b) => {
    if (a.won !== b.won) return a.won ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.title.localeCompare(b.title);
  });
}

export type AssembledSection = {
  section_type: string;
  heading: string;
  sort_order: number;
  body: string | null;
  status: "draft" | "needs_input";
  source_block_ids: string[];
  notes: string | null;
};

/**
 * Assembles a first draft from the approved-language library.
 *
 * Deliberately NOT a model call. This stage is a deterministic stitch of
 * Caravann's own approved text, because the SOW's requirement is that a draft
 * reads like Caravann wrote it - the risk to manage is generic model prose
 * reaching a procurement officer, not a blank page. A section with no library
 * material is returned as `needs_input` with an empty body rather than filled
 * with invented content: a visible gap is safe, plausible-sounding filler in a
 * document that goes to a public agency is not.
 *
 * The model's role comes later, per the SOW: tailoring the stitched draft to
 * the specific solicitation and running the voice-consistency pass. That step
 * needs the Word template and real winning proposals, which this build does
 * not have.
 */
export function assembleDraft(
  rfp: Pick<RfpRow, "title" | "client_agency" | "project_type" | "due_at">,
  blocks: LanguageBlockRow[],
  sections: readonly { section_type: string; heading: string; sort_order: number }[] = DEFAULT_SECTIONS
): AssembledSection[] {
  const byType = new Map<string, LanguageBlockRow[]>();
  for (const b of blocks) {
    const list = byType.get(b.section_type) ?? [];
    list.push(b);
    byType.set(b.section_type, list);
  }

  return sections.map((s) => {
    const available = rankBlocks(byType.get(s.section_type) ?? []);

    if (available.length === 0) {
      return {
        ...s,
        body: null,
        status: "needs_input" as const,
        source_block_ids: [],
        notes: "No approved language on file for this section - needs writing by hand.",
      };
    }

    const body = available
      .map((b) => fillPlaceholders(b.body, rfp))
      .join("\n\n");

    const fromWins = available.filter((b) => b.won).length;
    return {
      ...s,
      body,
      status: "draft" as const,
      source_block_ids: available.map((b) => b.id),
      notes:
        fromWins > 0
          ? `${available.length} block(s), ${fromWins} from winning proposals.`
          : `${available.length} block(s), none from a win yet - thinner ground.`,
    };
  });
}

/** Variable fields only. Locked boilerplate keeps its wording; the SOW treats
 *  the template as structured, not creative, so only the named placeholders
 *  move. An unknown placeholder is left visible rather than silently blanked,
 *  so a human sees what still needs filling. */
export function fillPlaceholders(
  text: string,
  rfp: Pick<RfpRow, "title" | "client_agency" | "project_type" | "due_at">
): string {
  const values: Record<string, string> = {
    ENGAGEMENT: rfp.title,
    CLIENT: rfp.client_agency,
    PROJECT_TYPE: rfp.project_type ?? "the engagement",
    DUE_DATE: rfp.due_at
      ? new Date(rfp.due_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: DISPLAY_TIME_ZONE,
        })
      : "the stated deadline",
  };
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => values[key] ?? match);
}

/** The naming convention the SOW fixes: [Engagement]_[Client]_Caravann Consulting.
 *  Slashes and colons are stripped because they break Drive and Windows paths. */
export function proposalFileName(rfp: Pick<RfpRow, "title" | "client_agency">): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${clean(rfp.title)}_${clean(rfp.client_agency)}_Caravann Consulting`;
}
