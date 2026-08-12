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
  Tab,
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
  /** Half of the text width, so a centre tab lands text in the middle. */
  centreTab: 4680,
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
        // `new Tab()`, not "\t" in the string. A literal tab character inside
        // <w:t> is not a tab in Word - it needs a <w:tab/> element, and without
        // one the due date simply butts against the solicitation number. This
        // is the same defect that welded the page number to the footer URL.
        new TextRun({
          children: [new Tab(), `${TEMPLATE.dueLabel} ${dueDate}`],
          size: TEMPLATE.headerTextSize,
          color: TEMPLATE.navy,
        }),
      ]),
    ],
  });
}

/**
 * Firm and site centred, page number hard right.
 *
 * Left-aligned with a centre tab and a right tab, which is the standard Word
 * footer pattern and the only one that actually holds.
 *
 * The obvious approach - centre the paragraph and tab before the page number -
 * does not work, and this is the second time it produced `www.caravann.co3`
 * with the number jammed against the URL. A centred paragraph centres its whole
 * content as one block; the tab has nothing to align against and collapses. The
 * source has the same problem for the same reason, and papered over it with a
 * 4pt page number so the collision was less obvious.
 *
 * Leading tab puts the text on the centre stop, second tab throws the number to
 * the right margin. Both hold whatever the page count reaches.
 *
 * The tabs are `new Tab()` objects, not "\t" in a string. A literal tab
 * character inside <w:t> renders as nothing in Word; only a <w:tab/> element
 * moves to the next stop. Getting that wrong is what produced
 * `www.caravann.co3` both times.
 */
export function caravannFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        tabStops: [
          { type: TabStopType.CENTER, position: TEMPLATE.centreTab },
          { type: TabStopType.RIGHT, position: TEMPLATE.rightTab },
        ],
        children: [
          new TextRun({
            children: [new Tab(), TEMPLATE.footerText, new Tab(), PageNumber.CURRENT],
            size: TEMPLATE.footerTextSize,
            color: TEMPLATE.navy,
          }),
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
