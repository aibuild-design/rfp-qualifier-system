import type { LanguageBlockRow, RfpRow } from "@/lib/supabase/types";
import { DISPLAY_TIME_ZONE } from "./rfp.ts";

/**
 * Caravann's own proposal structure, taken from the San Mateo County Transit
 * District submission rather than guessed at.
 *
 * The previous list here was a consulting-proposal shape - cover letter, firm
 * profile, approach, references, cost. Caravann's real one is a public
 * procurement shape, and the difference is not cosmetic: "Offeror", "Period for
 * Acceptance of Offers" and "Acknowledgement of Solicitation Amendments" are
 * FAR-derived headings that an evaluator scores against a checklist. A draft in
 * the wrong shape reads as a firm that has not bid to government before.
 *
 * Nine sections, in the order Caravann files them. A real solicitation states
 * its own required sections and takes precedence; this is what gets used when
 * it does not, and it is now a real default rather than an invention.
 */
/**
 * The fourteen sections, matching the fourteen headings in Caravann's real
 * template exactly.
 *
 * Not a coincidence and not adjustable in passing: sections are written under
 * the template's own headings, so a section listed here without a matching
 * heading in the file is assembled, shown, and then dropped on the way into the
 * .docx. A Key Personnel section was added here and did precisely that. It was
 * removed rather than papered over, for two reasons: the scope is fourteen
 * sections, and confirming a person was scoped as the assignment record rather
 * than as proposal input.
 *
 * If the team should appear in submissions, that is a real conversation and it
 * starts with adding the heading to Caravann's template. fillTemplate now
 * reports droppedSections, so the next attempt to add one fails loudly.
 *
 * The three appendices carry `attachment: true`. In the template they are bare
 * headings with no paragraph under them at all, because they are slots where a
 * document is attached - the completed RFP, the FAR/DFAR report - not sections
 * anybody writes prose into. The desk reported all three as "needs writing by
 * hand" on every bid, which is the wrong instruction: no amount of writing
 * fills them.
 */
export const DEFAULT_SECTIONS = [
  { section_type: "introduction", heading: "Introduction", sort_order: 10 },
  { section_type: "background", heading: "Background", sort_order: 20 },
  { section_type: "scope", heading: "Scope", sort_order: 30 },
  { section_type: "technical_description", heading: "Technical Description", sort_order: 40 },
  { section_type: "past_performance", heading: "Past Performance", sort_order: 50 },
{ section_type: "price", heading: "Price and Discounts", sort_order: 60 },
  { section_type: "terms", heading: "Terms and Conditions / Warranty", sort_order: 70 },
  { section_type: "representations", heading: "Representations & Certifications", sort_order: 80 },
  { section_type: "amendments", heading: "Acknowledgement of Solicitation Amendments", sort_order: 90 },
  { section_type: "acceptance_period", heading: "Offeror Period for Acceptance of Offers", sort_order: 100 },
  { section_type: "product_samples", heading: "Product Samples", sort_order: 110 },
  { attachment: true, section_type: "appendix_a", heading: "Appendix A - Completed RFP", sort_order: 120 },
  { attachment: true, section_type: "appendix_b", heading: "Appendix B - FAR/DFAR Report", sort_order: 130 },
  { attachment: true, section_type: "appendix_c", heading: "Appendix C - Reserved", sort_order: 140 },
] as const;

/**
 * The header and footer Caravann puts on every submission, taken from the same
 * document. Word keeps these in separate parts of the file that text extraction
 * does not touch, so they had to be read out of the archive directly - see
 * lib/extract.ts.
 *
 * `[Insert sol#]` is Caravann's own placeholder, from the template variant of
 * the header. The SOW calls these "the red-field placeholders", and filling
 * them is the difference between a draft and a submission.
 */
export const DOCUMENT_FURNITURE = {
  /** Three stacked lines, navy, with a rule beneath. Line three carries the
   *  solicitation number on the left and the due date hard right. */
  header: {
    firm: "Caravann Consulting",
    serviceLine: "Facilitator Services",
    numberLabel: "Solicitation Number:",
    dueLabel: "Solicitation Due Date:",
  },
  /** Firm and site on the left, page number on the right. */
  footer: "Caravann Consulting / www.caravann.co",
  /** Caravann's own placeholder, from the template variant of the header. The
   *  SOW calls these the red fields; filling them is what turns a draft into a
   *  submission. */
  unknownSolicitationNumber: "[Insert sol#]",
  /** Sampled from the document. Navy, not black. */
  ink: "1F3B73",
} as const;

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
  sections: readonly {
    section_type: string;
    heading: string;
    sort_order: number;
    attachment?: boolean;
  }[] = DEFAULT_SECTIONS
): AssembledSection[] {
  const byType = new Map<string, LanguageBlockRow[]>();
  for (const b of blocks) {
    const list = byType.get(b.section_type) ?? [];
    list.push(b);
    byType.set(b.section_type, list);
  }

  return sections.map((s) => {
    if (s.attachment) {
      return {
        ...s,
        body: null,
        status: "needs_input" as const,
        source_block_ids: [],
        notes: "Attach the document. This is a slot in the template, not a section to write.",
      };
    }

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
