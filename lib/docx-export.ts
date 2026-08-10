import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  PageNumber,
  Paragraph,
  TextRun,
} from "docx";
import type { ProposalSectionRow, RfpRow } from "@/lib/supabase/types";
import { formatDeadline } from "./rfp.ts";

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
  rfp: Pick<RfpRow, "title" | "client_agency" | "due_at" | "budget_amount" | "budget_source">,
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
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${rfp.client_agency} - ${rfp.title}`, size: 16, color: "888888" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Caravann Consulting - Page ", size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "888888" }),
                  new TextRun({ text: " of ", size: 16, color: "888888" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "888888" }),
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
