import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";
import { DOCUMENT_FURNITURE } from "./proposal.ts";
import type { ProposalSectionRow, RfpRow } from "@/lib/supabase/types";
import { formatDeadline, DISPLAY_TIME_ZONE } from "./rfp.ts";

/**
 * Builds the proposal draft as a real .docx.
 *
 * The SOW's end state is assembly into Caravann's own Word template. That
 * template isn't available to this build, so this produces a clean,
 * correctly-structured document instead of pretending to match a house style
 * nobody has supplied. When the template arrives, this becomes the content
 * source and the styling moves to it.
 *
 * Two things are deliberate:
 *
 * Sections with no approved language are included as explicit "TO BE
 * WRITTEN" placeholders rather than silently omitted. A missing section in a
 * document going to a public agency is a compliance failure; an obvious gap
 * is something a human fixes in five minutes. Omitting them would make the
 * draft look finished when it isn't.
 *
 * Formatting follows the most common public-agency requirement (12pt serif,
 * 1-inch margins) because that is what the fixtures state. Any solicitation
 * that specifies otherwise overrides it, and the compliance checklist is
 * where that requirement is recorded.
 */
export function buildProposalDocx(
  rfp: Pick<RfpRow, "title" | "client_agency" | "due_at" | "budget_amount" | "budget_source" | "external_id">,
  sections: ProposalSectionRow[]
): Document {
  const body: Paragraph[] = [];

  body.push(
    new Paragraph({
      text: rfp.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Prepared for ${rfp.client_agency}`, size: 24, color: "444444" })],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Caravann Consulting",
          size: 24,
          color: "444444",
        }),
      ],
      spacing: { after: 60 },
    })
  );

  if (rfp.due_at) {
    body.push(
      new Paragraph({
        children: [
          new TextRun({ text: `Submission deadline: ${formatDeadline(rfp.due_at)}`, size: 20, color: "666666" }),
        ],
        spacing: { after: 400 },
      })
    );
  }

  // A draft that reaches a procurement officer unreviewed is the failure this
  // notice exists to prevent. It is removed by the person finalising the
  // document - which is also how you can tell at a glance whether anyone has.
  body.push(
    new Paragraph({
      children: [
        new TextRun({
          text:
            "DRAFT - assembled from Caravann's approved-language library. Review, tailor to this " +
            "solicitation, and delete this notice before submission.",
          bold: true,
          size: 18,
          color: "B45309",
        }),
      ],
      spacing: { after: 400 },
      border: {
        top: { style: "single", size: 6, color: "E5C07B" },
        bottom: { style: "single", size: 6, color: "E5C07B" },
        left: { style: "single", size: 6, color: "E5C07B" },
        right: { style: "single", size: 6, color: "E5C07B" },
      },
    })
  );

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);

  for (const section of ordered) {
    body.push(
      new Paragraph({
        text: section.heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 160 },
      })
    );

    if (section.body) {
      for (const para of section.body.split(/\n{2,}/)) {
        const text = para.trim();
        if (!text) continue;
        body.push(
          new Paragraph({
            children: [new TextRun({ text, size: 24 })],
            spacing: { after: 200, line: 276 },
          })
        );
      }
    } else {
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "[TO BE WRITTEN - no approved language on file for this section.]",
              italics: true,
              color: "B91C1C",
              size: 24,
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }
  }

  // The two red fields. Neither is invented: the number comes from the
  // solicitation's own id when there is one, and Caravann's own placeholder is
  // used when there is not, so an unfilled field is visibly unfilled rather
  // than quietly blank.
  const solicitationNumber = rfp.external_id?.trim() || DOCUMENT_FURNITURE.unknownSolicitationNumber;
  const dueDate = rfp.due_at
    ? new Date(rfp.due_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: DISPLAY_TIME_ZONE })
    : "[Insert due date]";

  return new Document({
    creator: "Caravann Consulting",
    title: rfp.title,
    description: `Proposal draft for ${rfp.client_agency}`,
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 24 } },
        title: { run: { font: "Times New Roman", size: 40, bold: true, color: "0A0A0A" } },
        heading1: { run: { font: "Times New Roman", size: 28, bold: true, color: "0A0A0A" } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // 1 inch in twentieths of a point - the standard public-agency margin.
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        // Caravann's own furniture, copied from the San Mateo submission rather
        // than invented: three stacked navy lines with a rule beneath, the
        // solicitation number on the left of line three and the due date hard
        // right. An evaluator sees this before any of the writing, and a
        // proposal whose masthead does not match the firm's other submissions
        // reads as assembled by someone else.
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: DOCUMENT_FURNITURE.header.firm, size: 20, color: DOCUMENT_FURNITURE.ink })],
              }),
              new Paragraph({
                children: [new TextRun({ text: DOCUMENT_FURNITURE.header.serviceLine, size: 20, color: DOCUMENT_FURNITURE.ink })],
              }),
              new Paragraph({
                // A right tab at the margin puts the due date on the same line
                // as the number without a table.
                tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: DOCUMENT_FURNITURE.ink, space: 2 } },
                children: [
                  new TextRun({
                    text: `${DOCUMENT_FURNITURE.header.numberLabel} ${solicitationNumber}`,
                    size: 20,
                    color: DOCUMENT_FURNITURE.ink,
                  }),
                  new TextRun({
                    text: `\t${DOCUMENT_FURNITURE.header.dueLabel} ${dueDate}`,
                    size: 20,
                    color: DOCUMENT_FURNITURE.ink,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
                children: [
                  new TextRun({ text: DOCUMENT_FURNITURE.footer, size: 20, color: DOCUMENT_FURNITURE.ink }),
                  new TextRun({ text: "\t", size: 20 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 20, color: DOCUMENT_FURNITURE.ink }),
                ],
              }),
            ],
          }),
        },
        children: body,
      },
    ],
  });
}
