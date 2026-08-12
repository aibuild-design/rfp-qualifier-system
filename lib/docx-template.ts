/**
 * Caravann's document furniture, measured from the real submission.
 *
 * Every value here was read out of
 * `Internal Version_ San Mateo County Transit District_Facilitator Services
 * Proposal_Caravann.docx` - specifically `word/header1.xml` and
 * `word/footer2.xml` - rather than eyeballed from a screenshot or guessed.
 * Word keeps headers and footers in separate parts of the archive that text
 * extraction never touches, so they had to be unzipped and read directly.
 *
 * This file exists so the next person to build a document does not have to do
 * that again. Import the constants, call the two builders, and the masthead
 * matches every other proposal Caravann has filed.
 *
 * The measurements, and why they are what they are:
 *
 *   Navy            002060      Not #1F3B73, which an earlier pass sampled from
 *                               a screenshot and got wrong. Read from w:color.
 *   Header text     10pt        w:sz is in half-points, so w:sz="20".
 *   Footer text     11pt        w:sz="22".
 *   Rule            black       w:color="000000" on the bottom border - the rule
 *                               is NOT navy, even though the text above it is.
 *   Rule weight     0.5pt       w:sz="4" in eighths of a point.
 *   Right tab       9360 twips  6.5 inches: an 8.5in page less two 1in margins.
 *   Body font       Times New Roman 12pt
 *   Margins         1 inch      1440 twips, the public-agency standard.
 *
 * One deliberate deviation. In the source, line three of the header separates
 * the solicitation number from the due date with a run of literal spaces, and
 * the footer's page number sits in a 4pt run immediately after the URL. Both
 * were almost certainly typed by hand rather than intended. Spaces collapse the
 * moment a number is a different length, and 4pt is unreadable - which is how
 * the footer came out as `www.caravann.co3` with the number jammed against the
 * text. Both use a right-aligned tab stop here instead, which holds its position
 * whatever the content, and the page number matches the text size.
 */

import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
} from "docx";

export const TEMPLATE = {
  /** Read from w:color in the real header and footer. */
  navy: "002060",
  /** The rule beneath the header is black, unlike the text above it. */
  ruleColour: "000000",

  /** docx sizes are half-points: 20 = 10pt. */
  headerTextSize: 20,
  footerTextSize: 22,
  bodyTextSize: 24,
  headingSize: 28,
  titleSize: 40,

  /** Eighths of a point. 4 = 0.5pt. */
  ruleWeight: 4,

  /** Twips. 9360 = 6.5in = an 8.5in page less two 1in margins. */
  rightTab: 9360,
  /** Twips. 1440 = 1 inch on every side. */
  margin: 1440,

  bodyFont: "Times New Roman",

  firm: "Caravann Consulting",
  serviceLine: "Facilitator Services",
  numberLabel: "Solicitation Number:",
  dueLabel: "Solicitation Due Date:",
  footerText: "Caravann Consulting / www.caravann.co",

  /** Caravann's own placeholder, from the template variant of the header. The
   *  SOW calls these the red fields; filling them turns a draft into a
   *  submission, and leaving one visible is better than leaving it blank. */
  unknownSolicitationNumber: "[Insert sol#]",
  unknownDueDate: "[Insert due date]",
} as const;

/**
 * Three stacked navy lines with a rule beneath each, exactly as the source has
 * them. Line three carries the solicitation number on the left and the due date
 * hard right.
 *
 * The border repeats on all three paragraphs rather than sitting only on the
 * last. That looks redundant and is not: in the source each paragraph carries
 * its own `w:pBdr`, and dropping it from the first two changes the spacing
 * between the lines.
 */
export function caravannHeader(solicitationNumber: string, dueDate: string): Header {
  const line = (children: TextRun[]) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: TEMPLATE.rightTab }],
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: TEMPLATE.ruleWeight,
          color: TEMPLATE.ruleColour,
          space: 1,
        },
      },
      children,
    });

  const navy = (text: string) =>
    new TextRun({ text, size: TEMPLATE.headerTextSize, color: TEMPLATE.navy });

  return new Header({
    children: [
      line([navy(TEMPLATE.firm)]),
      line([navy(TEMPLATE.serviceLine)]),
      line([
        navy(`${TEMPLATE.numberLabel} ${solicitationNumber}`),
        // A tab rather than the source's run of literal spaces: spaces hold
        // their position only while the solicitation number stays the same
        // length, and it never does.
        navy(`\t${TEMPLATE.dueLabel} ${dueDate}`),
      ]),
    ],
  });
}

/**
 * Centred firm and site, with the page number tab-right.
 *
 * The source centres the text and then puts the page number in a 4pt run
 * immediately after it, which renders as `www.caravann.co3`. The tab stop and
 * matching text size here are the fix.
 */
export function caravannFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        tabStops: [{ type: TabStopType.RIGHT, position: TEMPLATE.rightTab }],
        children: [
          new TextRun({ text: TEMPLATE.footerText, size: TEMPLATE.footerTextSize, color: TEMPLATE.navy }),
          new TextRun({ text: "\t", size: TEMPLATE.footerTextSize }),
          new TextRun({ children: [PageNumber.CURRENT], size: TEMPLATE.footerTextSize, color: TEMPLATE.navy }),
        ],
      }),
    ],
  });
}

/** Page setup: one inch on every side, the public-agency standard. */
export const PAGE_PROPERTIES = {
  page: {
    margin: {
      top: TEMPLATE.margin,
      right: TEMPLATE.margin,
      bottom: TEMPLATE.margin,
      left: TEMPLATE.margin,
    },
  },
} as const;

/** Body, headings and title. Times New Roman throughout, near-black rather
 *  than pure black, matching the source. */
export const DOCUMENT_STYLES = {
  default: {
    document: { run: { font: TEMPLATE.bodyFont, size: TEMPLATE.bodyTextSize } },
    title: { run: { font: TEMPLATE.bodyFont, size: TEMPLATE.titleSize, bold: true, color: "0A0A0A" } },
    heading1: { run: { font: TEMPLATE.bodyFont, size: TEMPLATE.headingSize, bold: true, color: "0A0A0A" } },
  },
} as const;
