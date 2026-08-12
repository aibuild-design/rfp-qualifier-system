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
  TableOfContents,
  TabStopType,
  TextRun,
} from "docx";

export const TEMPLATE = {
  /** Read from w:color in the real header and footer. */
  navy: "002060",
  /** The rule beneath the header is black, unlike the text above it. */
  ruleColour: "000000",
  /** The template's own red for unfilled fields. */
  redField: "C00000",

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

  /**
   * Caravann's own identity block, transcribed from the cover page of
   * `Copy of Template for RFPs.docx`.
   *
   * The CAGE code and UEI are federal contracting identifiers - a proposal to a
   * federal or federally-funded agency is not complete without them, and they
   * are not the sort of thing to retype from memory. Note the address is
   * Berkeley; the placeholder profile had Oakland, which was invented.
   */
  offeror: {
    name: "Caravann Consulting",
    street: "2008 Ninth St",
    cityStateZip: "Berkeley, CA 94701",
    contactName: "Khaled El-Sawaf",
    phone: "510-224-0070",
    email: "khaled@caravann.co",
    url: "https://www.caravann.co",
    cageCode: "9NV03",
    uei: "HSV8KJY684V5",
    taxEin: "92-1867651",
  },

  /** The cover page's own wording, verbatim. */
  coverHeading: "Response to Request for Proposal",
  unknownTitle: "[Insert Title]",

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
export function caravannHeader(solicitationNumber: string, dueDate: string, title?: string): Header {
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
      // The running header carries the proposal's own title, not a fixed
      // service line - the template shows [Insert Title] here.
      line([navy(title || TEMPLATE.serviceLine)]),
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

/**
 * The cover page, as the template has it: a centred stack running heading,
 * title, solicitation number, due date, then the two "prepared by" and
 * "prepared for" blocks.
 *
 * It is a page of its own - the template puts a page break after it and starts
 * the numbering at the table of contents, so the cover carries no header,
 * footer or page number.
 *
 * The red fields stay visible when unknown rather than being blanked. An
 * evaluator seeing `[Insert Agency Name]` knows a step was skipped; a blank
 * space reads as an oversight nobody noticed.
 */
export function coverPage(title: string, solicitationNumber: string, dueDate: string): Paragraph[] {
  const o = TEMPLATE.offeror;

  const centred = (text: string, opts: { bold?: boolean; size?: number; colour?: string; after?: number } = {}) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: opts.after ?? 120 },
      children: [
        new TextRun({
          text,
          bold: opts.bold ?? false,
          size: opts.size ?? TEMPLATE.bodyTextSize,
          color: opts.colour ?? TEMPLATE.navy,
          font: TEMPLATE.bodyFont,
        }),
      ],
    });

  // Anything still unfilled is shown in the template's own red so it cannot be
  // mistaken for finished text.
  const red = (text: string) => (/^\[.*\]$/.test(text) ? TEMPLATE.redField : TEMPLATE.navy);

  return [
    new Paragraph({ text: "", spacing: { after: 2400 } }),
    centred(TEMPLATE.coverHeading, { bold: true, size: 28, after: 360 }),
    centred(title, { size: 26, colour: red(title), after: 360 }),
    centred(`${TEMPLATE.numberLabel} ${solicitationNumber}`, { bold: true, size: 26, colour: red(solicitationNumber), after: 360 }),
    centred(`${TEMPLATE.dueLabel} ${dueDate}`, { bold: true, size: 26, colour: red(dueDate), after: 480 }),

    centred("Prepared by Offeror:", { bold: true, size: 26, after: 60 }),
    centred(o.name, { after: 0 }),
    centred(o.street, { after: 0 }),
    centred(o.cityStateZip, { after: 0 }),
    centred(`Point of Contact: ${o.contactName}`, { bold: true, after: 0 }),
    centred(`${o.phone} | ${o.email}`, { after: 0 }),
    centred(`URL: ${o.url}`, { after: 0 }),
    centred(`CAGE Code: ${o.cageCode} | UEI: ${o.uei}`, { bold: true, after: 0 }),
    centred(`Tax EIN: ${o.taxEin}`, { after: 480 }),

    centred("Prepared For:", { bold: true, size: 26, after: 60 }),
    centred("[Insert Agency Name]", { colour: TEMPLATE.redField, after: 0 }),
    centred("[Insert Agency Address]", { colour: TEMPLATE.redField, after: 0 }),
    centred("Point of Contact: [Insert Agency POC]", { colour: TEMPLATE.redField, after: 0 }),
    centred("[Insert Agency POC Telephone]", { colour: TEMPLATE.redField, after: 0 }),
    centred("[Insert Agency POC Email]", { colour: TEMPLATE.redField, after: 0 }),
  ];
}

/**
 * The table of contents, which the template puts on page 1.
 *
 * A real field code rather than a typed-out list, so page numbers are right
 * after editing. Word asks to update it on open; Google Docs renders it from
 * the headings. A hand-typed contents page is wrong the moment a section grows
 * by a paragraph, and on a submission with a page limit that is not cosmetic.
 */
export function tableOfContents(): [Paragraph, TableOfContents] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: "TABLE OF CONTENTS", bold: true, size: 26, color: TEMPLATE.navy, font: TEMPLATE.bodyFont, underline: {} }),
      ],
    }),
    new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
  ];
}

/**
 * Page setup: US Letter, one inch on every side.
 *
 * The size has to be stated. Left unset the docx library defaults to A4, which
 * is 210mm wide against Letter's 216mm and 297mm tall against 279mm - so every
 * page comes out narrower and longer than the agency expects. On a submission
 * with a hard page limit that is not cosmetic: the same text reflows onto a
 * different number of pages, and a proposal that runs to 21 pages against a
 * 20-page limit is disqualified without being read.
 *
 * Both of Caravann's real documents are Letter: w:w="12240" w:h="15840".
 */
export const PAGE_PROPERTIES = {
  page: {
    size: { width: 12240, height: 15840 },
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
