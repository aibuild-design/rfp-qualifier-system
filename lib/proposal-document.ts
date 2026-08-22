import { fillTemplate } from "./docx-fill.ts";
import { rankEngagements } from "./compose.ts";
import { caravannTemplate } from "./template-store.ts";

/**
 * One proposal document, assembled the same way wherever it is asked for.
 *
 * This existed twice and the two copies disagreed. The build action filled
 * Caravann's own template and filed the result to Drive; the download button
 * called `buildProposalDocx`, which reconstructs a lookalike in code and was
 * abandoned for the reasons written at the top of `docx-fill.ts`. So the
 * document in the bid folder and the document Khaled downloaded were different
 * files: different furniture, and after the past-performance work, different
 * content. Whichever one he checked, the other was the one that shipped.
 *
 * The queries stay with the callers, because one of them runs under the user's
 * session and RLS and the other under the service role. Everything after the
 * queries lives here.
 */

export type ProposalEngagement = {
  client: string;
  client_type: string | null;
  sector: string | null;
  title: string;
  started_on: string | null;
  ended_on: string | null;
  situation: string | null;
  what_we_did: string | null;
  outcome: string | null;
  contract_value: string | number | null;
  contract_number: string | null;
  contract_type: string | null;
  project_role: string | null;
  reference_name: string | null;
  reference_title: string | null;
  reference_email: string | null;
  reference_phone: string | null;
  reference_contactable: boolean;
  won: boolean;
};

export type ProposalInputs = {
  rfp: {
    title: string;
    client_agency: string;
    solicitation_number: string | null;
    due_at: string | null;
    agency_address?: string | null;
    agency_poc_name?: string | null;
    agency_poc_phone?: string | null;
    agency_poc_email?: string | null;
  };
  sections: { heading: string; body: string | null; tailored_body?: string | null }[];
  engagements: ProposalEngagement[];
  addenda: { title: string | null; sequence: number | null; received_at: string | null }[];
  firm: Record<string, string | null> | null;
};

/**
 * The cover page prints the title beside the agency, and the stored title
 * carries the agency as a prefix, so the two together read "East Bay Joint
 * Powers Authority - East Bay Joint Powers Authority - Executive Team
 * Facilitation...". The cover wants the solicitation's own name.
 */
export function coverTitle(title: string, agency: string): string {
  const escaped = agency.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = title.replace(new RegExp(`^\\s*${escaped}\\s*[-‐-―:]\\s*`, "i"), "").trim();
  return stripped || title;
}

const monthYear = (date: string | null): string | null =>
  date
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

function periodOf(engagement: ProposalEngagement): string | null {
  const from = monthYear(engagement.started_on);
  const to = monthYear(engagement.ended_on);
  if (from && to) return `${from} through ${to}`;
  if (from) return `${from} to current`;
  return null;
}

/**
 * Which engagements fill the three numbered reference blocks.
 *
 * Delivered work only. A submitted proposal has no contract number, no period
 * of performance and no customer who can be telephoned about it, so listing one
 * in a past-performance table invites a buyer to verify something that does not
 * exist. The narrative section still cites it, labelled as a proposal rather
 * than a delivery.
 */
export function referenceBlocks(engagements: ProposalEngagement[], against: string) {
  const delivered = engagements.filter((e) => e.won);
  const byClient = new Map(delivered.map((e) => [e.client, e]));
  return rankEngagements(delivered, against)
    .slice(0, 3)
    .map((ranked) => byClient.get(ranked.client))
    .filter((e): e is ProposalEngagement => Boolean(e))
    .map((e) => ({
      client: e.client,
      contractNumber: e.contract_number,
      amount: e.contract_value ? `$${Number(e.contract_value).toLocaleString("en-US")}` : null,
      contractType: e.contract_type,
      period: periodOf(e),
      role: e.project_role,
      referenceName: [e.reference_name, e.reference_title].filter(Boolean).join(", ") || null,
      referencePhone: e.reference_phone,
      referenceEmail: e.reference_email,
      description: [e.situation, e.what_we_did, e.outcome].filter(Boolean).join(" "),
    }));
}

/** The appendices, which the template ships as bare headings over white space. */
export const APPENDIX_BODIES: Record<string, string> = {
  "Appendix A - Completed RFP":
    "{to be attached: the completed solicitation forms for this RFP, signed by an authorised representative of Caravann Consulting}",
  "Appendix B - FAR/DFAR Report":
    "{to be attached: Caravann Consulting's representations and certifications report from SAM.gov}",
  "Appendix C - Reserved":
    "This appendix is reserved and carries no content for this solicitation.",
};

/** Returns null when the template is unreachable, so the caller can fall back. */
export async function assembleProposalDocx(inputs: ProposalInputs): Promise<Buffer | null> {
  const template = await caravannTemplate();
  if (!template) return null;

  const { rfp, sections, engagements, addenda, firm } = inputs;

  const body = Object.fromEntries(
    sections
      .map((s) => [s.heading, s.tailored_body ?? s.body] as const)
      .filter(([, text]) => Boolean(text)) as [string, string][]
  );

  // None issued is itself a statement the buyer needs, so the row says so
  // rather than leaving the table blank.
  const amendments = addenda.length
    ? addenda.map((a) => ({
        label: a.title ?? `Addendum ${a.sequence ?? ""}`.trim(),
        date: a.received_at?.slice(0, 10) ?? "",
      }))
    : [{ label: "No amendments issued as of the date of this proposal.", date: "Not applicable" }];

  const { buffer } = await fillTemplate(template, {
    title: coverTitle(rfp.title, rfp.client_agency),
    solicitationNumber: rfp.solicitation_number ?? "",
    dueDate: rfp.due_at ?? "",
    agencyName: rfp.client_agency,
    // The four red fields on the cover. Nothing ever passed them, so every
    // draft went out reading "[Insert Agency Address]" on its front page.
    agencyAddress: rfp.agency_address ?? undefined,
    agencyPocName: rfp.agency_poc_name ?? undefined,
    agencyPocPhone: rfp.agency_poc_phone ?? undefined,
    agencyPocEmail: rfp.agency_poc_email ?? undefined,
    sections: body,
    pastPerformance: referenceBlocks(engagements, `${rfp.title} ${rfp.client_agency}`),
    amendments,
    // What was actually written for this bid wins over the generic line.
    //
    // Appendix headings ship with no instruction paragraph under them, so
    // injectSections has nothing to replace and skips them, and the constant
    // below filled the gap. That was right while nothing wrote appendix
    // content; it is wrong the moment something does, because the drafted text
    // was being silently discarded in favour of a sentence about attaching
    // documents.
    appendices: {
      ...APPENDIX_BODIES,
      ...Object.fromEntries(
        sections
          .filter((x) => /^Appendix\b/i.test(x.heading) && (x.tailored_body ?? x.body)?.trim())
          .map((x) => [x.heading, (x.tailored_body ?? x.body) as string]),
      ),
    },
    firm: {
      legalName: firm?.legal_name,
      address: firm?.address,
      pointOfContact: firm?.point_of_contact,
      telephone: firm?.telephone,
      email: firm?.email,
      website: firm?.website,
      cageCode: firm?.cage_code,
      uei: firm?.uei,
      duns: firm?.duns,
      taxEin: firm?.tax_ein,
    },
  });
  return buffer;
}
