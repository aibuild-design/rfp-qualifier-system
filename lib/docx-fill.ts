import JSZip from "jszip";

/**
 * Fills Caravann's own blank template rather than rebuilding it.
 *
 * The previous approach measured the template - colours, sizes, tab stops, page
 * size - and reconstructed a lookalike in code. That works until it does not,
 * and it kept not working: the footer collapsed, the page came out A4, the
 * section list was three short, the logo was missing. Each was a separate bug
 * with a separate fix, and every one of them was a detail the real file already
 * had correct.
 *
 * So this opens `Copy of Template for RFPs.docx`, substitutes the placeholders,
 * writes the drafted prose under the right headings, and repackages. Everything
 * not touched stays byte-identical: the logo, the styles, the numbering, the
 * table-of-contents field, the header and footer parts, the page size, the
 * spacing nobody thought to measure.
 *
 * That works because of one lucky property of this particular file, checked
 * before relying on it: all 23 placeholders sit intact inside single `<w:t>`
 * runs. Word usually splits text across runs when formatting or spellcheck
 * state changes mid-phrase, and a placeholder split as `[Insert` + ` Title]`
 * cannot be found by a string search. These are not split. If a future edit
 * splits one, `fillTemplate` reports it as unreplaced rather than silently
 * shipping a document with `[Insert sol#]` still on the cover.
 */

/** Every red field in the template, and where its value comes from. */
export type TemplateValues = {
  title: string;
  solicitationNumber: string;
  dueDate: string;
  agencyName: string;
  agencyAddress?: string;
  agencyPocName?: string;
  agencyPocPhone?: string;
  agencyPocEmail?: string;
  /**
   * The firm's own cover-page details.
   *
   * These were hardcoded here. They appear on the front of every submission, so
   * a change of office meant a code change, and nobody outside the repository
   * could check what was being sent out under their name. Passed in now, with
   * the previous values as fallbacks so an unconfigured database still produces
   * a correct document.
   */
  firm?: {
    legalName?: string | null;
    address?: string | null;
    pointOfContact?: string | null;
    telephone?: string | null;
    email?: string | null;
    website?: string | null;
    cageCode?: string | null;
    uei?: string | null;
    duns?: string | null;
    taxEin?: string | null;
  };
  /**
   * Drafted prose, keyed by the template's own heading text. Each section in
   * the template carries a boilerplate lead sentence and then a bracketed
   * instruction to whoever is writing it - "[Insert brief introduction
   * statement about your firm...]". Supplying a body replaces that instruction.
   *
   * A heading with no entry keeps its instruction, which is the right default:
   * the writer still sees what the section needs, rather than finding a gap
   * where guidance used to be.
   */
  sections?: Record<string, string>;
  /**
   * The three numbered reference slots under Past Performance.
   *
   * The template does not treat past performance as prose. It has a narrative
   * heading and then three structured blocks, each asking for a contract
   * number, an amount, a period, a role and a reachable customer contact. The
   * drafted narrative went into the prose slot and the three blocks kept their
   * "(Enter name of Customer Agency...)" instructions, which is why a reader
   * looking at the document concluded past performance had not been written.
   *
   * A field left null keeps its red instruction rather than being guessed at.
   * Contract numbers, dollar values and reference phone numbers are exactly the
   * facts a public buyer verifies, and a plausible invention is worse here than
   * a visible blank.
   */
  pastPerformance?: PastPerformanceEntry[];
  /** Rows for the solicitation amendments table. */
  amendments?: { label: string; date: string }[];
  /** Body text for the appendix headings, keyed by heading text. */
  appendices?: Record<string, string>;
};

export type PastPerformanceEntry = {
  /** Names the block: "Past Performance #1: <client>". */
  client: string;
  contractNumber?: string | null;
  amount?: string | null;
  contractType?: string | null;
  period?: string | null;
  role?: string | null;
  referenceName?: string | null;
  referencePhone?: string | null;
  referenceEmail?: string | null;
  description: string;
};

const COMPANY = "Caravann Consulting";

/** XML-escape, because a solicitation title with an ampersand in it would
 *  otherwise produce a document Word refuses to open. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The substitutions, in order. `[Insert Company Name]` is always Caravann and
 * is filled without being asked for; the agency fields fall back to the
 * template's own red placeholder when unknown, so an unfilled field stays
 * visibly unfilled rather than becoming a blank an evaluator reads as an
 * oversight.
 */
function substitutions(v: TemplateValues): [string, string][] {
  // An unknown agency field becomes a braced note saying why it is empty.
  //
  // It used to fall back to the template's own "[Insert Agency Address]",
  // which is visibly unfilled and says nothing else. Everything else the desk
  // cannot supply is written as {to be supplied by Caravann} and coloured red
  // off the brace, so one field in square brackets was the odd one out and did
  // not get the colour. More usefully, the reason matters: the desk read the
  // solicitation and the address genuinely was not in it, which is a different
  // instruction to whoever finishes the document than "nobody filled this in".
  const keep = (value: string | undefined, field: string) =>
    value?.trim() || `{${field} is not stated in the solicitation: confirm with the agency before filing}`;
  return [
    ["[Insert Company Name]", COMPANY],
    // The cover's conditional remit-to line, which asks for an address only if
    // it differs from the mailing address above. Caravann's does not, so it
    // stood in the finished document as red instruction text, reading like an
    // unfilled field on a proposal that was otherwise complete. Answering the
    // condition is what the line is for.
    ["\u201cRemit to\u201d address, if different than mailing address above", "Remit to: same as the address above."],
    // Not a bracketed placeholder - the template writes the blank as a run of
    // underscores, so it needs its own substitution or the finished document
    // reads "for solicitation________".
    ["solicitation________", `solicitation ${esc(v.solicitationNumber)}`],
    ["[Insert Title]", esc(v.title)],
    ["[Insert sol#]", esc(v.solicitationNumber)],
    ["[Insert due date]", esc(v.dueDate)],
    ["[insert customer name]", esc(v.agencyName)],
    // The template writes the title placeholder two ways. Both need catching,
    // or the Introduction reads "...for solicitation RFP 2026-25, [insert title]".
    ["[insert title]", esc(v.title)],
    // The first-page footer carries its own placeholder, separate from the one
    // on the following pages.
    ["[Insert Offeror Name / Offeror website]", `${COMPANY} / www.caravann.co`],
    // A second offeror block, separate from the filled cover. Values taken from
    // Caravann's own cover page rather than invented.
    //
    // DUNS was left as a raw "[Insert Offeror DUNS#]" on the theory that a
    // guessed federal identifier is worse than a visible gap. Both are bad, and
    // there is a third answer: the federal government retired DUNS in April
    // 2022 and replaced it with the UEI, which is already stated on the line
    // above. So the field is not missing, it is obsolete - and saying that is
    // accurate rather than invented, and reads as deliberate to an evaluator
    // where a bracketed placeholder reads as unfinished.
    ["[Insert Offeror Name]", esc(v.firm?.legalName || COMPANY)],
    ["[Insert Offeror Address]", esc(v.firm?.address || "2008 Ninth St, Berkeley, CA 94701")],
    ["[Insert Offeror Point of Contact:]", esc(v.firm?.pointOfContact || "Khaled El-Sawaf")],
    ["[Insert Offeror Telephone]", esc(v.firm?.telephone || "510-224-0070")],
    ["[Insert Offeror Email]", esc(v.firm?.email || "khaled@caravann.co")],
    ["[Insert Offeror Website]", esc(v.firm?.website || "https://www.caravann.co")],
    ["[Insert Offeror CAGE Code]", esc(v.firm?.cageCode || "9NV03")],
    ["[Insert Offeror UEI#]", esc(v.firm?.uei || "HSV8KJY684V5")],
    ["[Insert Offeror DUNS#]", esc(v.firm?.duns || "N/A - replaced by UEI (April 2022)")],
    ["[Insert Offeror TAX EIN#]", esc(v.firm?.taxEin || "92-1867651")],
    ["[Insert Agency Name]", esc(keep(v.agencyName, "the agency name"))],
    ["[Insert Agency Address]", esc(keep(v.agencyAddress, "the agency address"))],
    ["[Insert Agency POC Telephone]", esc(keep(v.agencyPocPhone, "the agency contact telephone"))],
    ["[Insert Agency POC Email]", esc(keep(v.agencyPocEmail, "the agency contact email"))],
    // Last, because "[Insert Agency POC]" is a prefix of the two above and
    // would otherwise consume them.
    ["[Insert Agency POC]", esc(keep(v.agencyPocName, "the agency point of contact"))],
  ];
}

export type FillResult = {
  /** The finished .docx. */
  buffer: Buffer;
  /** Placeholders that were still present after substitution. Empty is the
   *  expected case; anything here means the template changed and a field is
   *  about to ship unfilled. */
  unreplaced: string[];
  /** How many substitutions were made, for the caller to sanity-check. */
  replacements: number;
  /**
   * Drafted sections that matched no heading in the template, and so were
   * dropped.
   *
   * This used to happen silently. A section assembled in the app but absent
   * from Caravann's real document simply never appeared in the .docx, and
   * nothing anywhere said so - the dashboard showed a section the submission
   * did not contain, which is the worst way for the two to disagree.
   */
  droppedSections: string[];
};

/**
 * Substitute the template's placeholders and return the finished document.
 *
 * Only `word/document.xml`, the headers and the footers are touched. Media,
 * styles, numbering, relationships and content types are copied through
 * untouched, which is what keeps the result a replica rather than a rendering.
 */
export async function fillTemplate(template: Buffer | Uint8Array, values: TemplateValues): Promise<FillResult> {
  const zip = await JSZip.loadAsync(template, { createFolders: false });

  // The output carries one entry the template does not: a `word/` directory
  // record that JSZip writes for nested paths. `createFolders: false` governs
  // loading, not generating, and there is no option for the other side - it was
  // tried, along with removing the folder objects before generating, and
  // neither stops it.
  //
  // Left alone deliberately. Directory entries are valid in a zip, most .docx
  // files in the wild have them, and Word, Google Docs and LibreOffice all read
  // either shape. Every actual part - document, styles, numbering, media,
  // relationships, content types - is byte-identical except where a placeholder
  // was substituted, which is the property that matters.
  const subs = substitutions(values);
  let replacements = 0;
  let droppedSections: string[] = [];

  // Headers and footers carry the title, number and date too, so they need the
  // same pass - this is why the running header on page two shows the real
  // solicitation rather than the placeholder.
  const parts = Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)
  );

  for (const name of parts) {
    let xml = await zip.file(name)!.async("string");
    const result = replaceAcrossRuns(xml, subs);
    xml = result.xml;
    replacements += result.count;
    if (/^word\/footer/.test(name)) xml = fixFooter(xml);
    zip.file(name, xml);
  }

  // Write the drafted prose over the template's writing instructions.
  if (values.sections && Object.keys(values.sections).length > 0) {
    const documentPart = zip.file("word/document.xml")!;
    const filled = injectSections(await documentPart.async("string"), values.sections);
    zip.file("word/document.xml", filled.xml);
    replacements += filled.written;
    droppedSections = filled.dropped;
  }

  // The structured past-performance blocks, the appendices and the amendments
  // table. All three are parts of the template that carry no writing
  // instruction for injectSections to find, which is why all three arrived
  // untouched in every document produced before this.
  if (values.pastPerformance?.length) {
    const documentPart = zip.file("word/document.xml")!;
    const done = injectPastPerformance(await documentPart.async("string"), values.pastPerformance);
    zip.file("word/document.xml", done.xml);
    replacements += done.filled;
  }
  if (values.appendices && Object.keys(values.appendices).length > 0) {
    const documentPart = zip.file("word/document.xml")!;
    const done = injectAppendices(await documentPart.async("string"), values.appendices);
    zip.file("word/document.xml", done.xml);
    replacements += done.filled;
  }
  if (values.amendments?.length) {
    const documentPart = zip.file("word/document.xml")!;
    const done = fillAmendments(await documentPart.async("string"), values.amendments);
    zip.file("word/document.xml", done.xml);
    replacements += done.filled;
  }

  // The contents page lists sections, not their internals.
  {
    const documentPart = zip.file("word/document.xml");
    if (documentPart) zip.file("word/document.xml", tocTopLevelOnly(await documentPart.async("string")));
  }

  // One font for the whole document. See setDefaultFont: the template names
  // none, so without this the body renders in whatever the reader's
  // application defaults to while the reference blocks render in Times New
  // Roman beside it.
  const stylesPart = zip.file("word/styles.xml");
  if (stylesPart) zip.file("word/styles.xml", setDefaultFont(await stylesPart.async("string")));

  // Setting the document default is not sufficient on its own. A default only
  // governs runs that name no font, and the template names one in 25 places:
  // every numbered list marker carries an explicit Calibri, so a document whose
  // body is Times New Roman renders "1." "2." "3." in a sans face beside it.
  //
  // Applied across every part that holds text, and only to text faces. Symbol
  // and Wingdings are how Word draws bullet glyphs; rewriting those turns a
  // bullet into a letter.
  //
  // The same pass carries the no-dashes rule into the template's own words.
  // Every string the model writes is stripped at intake, and the template was
  // never covered by that, so "Appendix A – Completed RFP" shipped with an en
  // dash in the heading and again in the contents page. Caravann's rule is that
  // the documents contain none, and the template is part of the document.
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|numbering|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(name)) continue;
    const part = zip.file(name);
    if (!part) continue;
    zip.file(name, houseStyle(await part.async("string")));
  }

  // Blank pages. The template carries 54 paragraphs with pageBreakBefore, and
  // several of them hold no text at all - an empty paragraph forced onto a new
  // page is a blank page, which is what shows up as "page 2 is empty".
  //
  // Only the empty ones lose the break. A break before a real heading is
  // deliberate and stays; a break before nothing never was.
  {
    const documentPart = zip.file("word/document.xml")!;
    let xml = await documentPart.async("string");
    let removed = 0;
    xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => {
      if (!/pageBreakBefore/.test(paragraph)) return paragraph;
      const text = [...paragraph.matchAll(/<w:t[ >][^>]*>([^<]*)<\/w:t>|<w:t>([^<]*)<\/w:t>/g)]
        .map((m) => m[1] ?? m[2])
        .join("")
        .trim();
      if (text) return paragraph;
      removed++;
      return paragraph.replace(/<w:pageBreakBefore[^>]*\/>/g, "");
    });
    if (removed > 0) zip.file("word/document.xml", xml);
  }

  // Runs of empty paragraphs. Between the contents and the body the template
  // has four in a row, and four empty paragraphs are enough to fill a page on
  // their own - which is the blank page 2 that survived removing their page
  // breaks. Collapsed to one, so deliberate spacing is kept and the padding is
  // not.
  //
  // Paragraphs carrying a section break are never touched: dropping one would
  // merge two sections and take the header and footer assignment with it.
  {
    const documentPart = zip.file("word/document.xml")!;
    const xml = await documentPart.async("string");
    const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
    if (paragraphs) {
      const isEmpty = (par: string) =>
        !/<w:sectPr/.test(par) &&
        !/<w:drawing|<w:tbl|instrText/.test(par) &&
        [...par.matchAll(/<w:t[ >][^>]*>([^<]*)<\/w:t>|<w:t>([^<]*)<\/w:t>/g)]
          .map((m) => m[1] ?? m[2])
          .join("")
          .trim() === "";

      const drop = new Set<number>();
      let run = 0;
      paragraphs.forEach((par, i) => {
        if (isEmpty(par)) {
          run++;
          if (run > 1) drop.add(i);
        } else {
          run = 0;
        }
      });

      if (drop.size > 0) {
        let i = 0;
        const collapsed = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (par) => (drop.has(i++) ? "" : par));
        zip.file("word/document.xml", collapsed);
      }
    }
  }

  // The template restarts page numbering in three of its sections, which is why
  // the appendices begin at 1 again while the contents lists them as A, B and C.
  // Only the first restart is wanted - that is the one putting page 1 at the
  // table of contents rather than on the cover.
  {
    const documentPart = zip.file("word/document.xml")!;
    let xml = await documentPart.async("string");
    let seen = 0;
    xml = xml.replace(/<w:pgNumType[^>]*w:start="1"[^>]*\/>/g, (match) => (++seen === 1 ? match : ""));
    if (seen > 1) zip.file("word/document.xml", xml);
  }

  // Report anything left rather than trusting the substitution ran. A template
  // edit that splits a placeholder across runs would otherwise ship a proposal
  // with "[Insert sol#]" on its cover.
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const unreplaced = subs
    .map(([placeholder]) => placeholder)
    .filter((placeholder) => documentXml.includes(placeholder))
    // The agency fields are deliberately left in place when unknown.
    .filter((placeholder) => !/Agency|customer name/i.test(placeholder));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, unreplaced, replacements, droppedSections };
}

/**
 * The template's own placeholders, exported so a caller can check a document
 * before sending it anywhere. Not derived from the file at runtime: this list
 * is what the code knows how to fill, and a mismatch against the file is the
 * thing worth catching.
 */
export const TEMPLATE_PLACEHOLDERS = [
  "[Insert Company Name]",
  "[Insert Title]",
  "[Insert sol#]",
  "[Insert due date]",
  "[insert customer name]",
  "[Insert Agency Name]",
  "[Insert Agency Address]",
  "[Insert Agency POC]",
  "[Insert Agency POC Telephone]",
  "[Insert Agency POC Email]",
] as const;


/**
 * Substitute placeholders even when Word has split them across runs.
 *
 * A plain string replace over the raw XML finds a placeholder only when it sits
 * inside one `<w:t>`. In `word/document.xml` all of them do, which is what an
 * earlier check confirmed - but the headers are different, and nobody checked
 * those:
 *
 *     'Solicitation Number: ['   'Insert sol#'   ']'
 *     'Solicitation Due Date: ['  'Insert due date'  ']'
 *
 * Three runs each, so `[Insert sol#]` was never found and the running header
 * shipped with the red placeholder still on it while the title beside it filled
 * correctly. Word splits runs whenever formatting, language or spellcheck state
 * changes mid-phrase, so this is normal and will happen again.
 *
 * Working per paragraph: join its runs, substitute on the joined text, then put
 * the result back in the first run and empty the others. Emptied rather than
 * removed, because Word keeps formatting per run and deleting them would drop
 * the paragraph's styling.
 */
/**
 * Drop the template's red from text we have just written.
 *
 * Every unfilled field in the template is red, `w:color w:val="ff0000"`, so
 * whoever completes it can see at a glance what still needs a human. That
 * convention is worth keeping. It is also exactly why our own prose must not
 * inherit it: text written into a red run stays red, and a finished section
 * rendered in warning-red tells the reader the opposite of the truth.
 *
 * Applied only to runs actually filled, so a field nobody supplied a value for
 * keeps its red and keeps meaning "this one still needs you". Only the two red
 * values the template uses are removed, rather than every colour, so a heading
 * or a deliberate accent elsewhere in the paragraph survives.
 */
function clearFilledColour(fragment: string): string {
  return fragment.replace(/<w:color\s+w:val="(?:ff0000|c00000)"\s*\/>/gi, "");
}

function replaceAcrossRuns(xml: string, subs: [string, string][]): { xml: string; count: number } {
  let count = 0;

  const out = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => {
    // Split on tabs first and work within each segment.
    //
    // Collapsing a whole paragraph into its first run strands any `<w:tab/>`
    // between the runs it emptied, and the header has exactly that shape -
    // "Solicitation Number: [", "Insert sol#", "]", <w:tab/>, "Solicitation Due
    // Date: [", ... - so the first attempt produced
    // "Solicitation Number: RFP 2026-25Solicitation Due Date: August 27" with
    // the tab pushed to the end and the due date no longer at the right margin.
    //
    // A placeholder never spans a tab, so joining within a segment is enough to
    // reunite one, and the tabs keep their positions.
    const segments = paragraph.split(/(<w:tab\/>)/);
    let touched = false;

    const rebuilt = segments.map((segment) => {
      if (segment === "<w:tab/>") return segment;
      const runs = [...segment.matchAll(/<w:t[ >][^>]*>([^<]*)<\/w:t>|<w:t>([^<]*)<\/w:t>/g)];
      if (runs.length === 0) return segment;

      const joined = runs.map((m) => m[1]).join("");
      let replaced = joined;
      for (const [from, to] of subs) {
        if (!replaced.includes(from)) continue;
        count += replaced.split(from).length - 1;
        replaced = replaced.split(from).join(to);
      }
      if (replaced === joined) return segment;
      touched = true;

      // The segment's text goes into its first run and the rest are emptied
      // rather than removed - Word keeps formatting per run, so deleting them
      // would drop the styling. Losing the split is the point: it was an
      // artefact of how the placeholder was typed, not a deliberate mix.
      let first = true;
      const filled = segment.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_all, open: string, _old: string, close: string) => {
        if (!first) return `${open}${close}`;
        first = false;
        const tag = open.includes("xml:space") ? open : open.replace(/>$/, ' xml:space="preserve">');
        return `${tag}${replaced}${close}`;
      });
      return clearFilledColour(filled);
    });

    return touched ? rebuilt.join("") : paragraph;
  });

  return { xml: out, count };
}

/**
 * Replace each section's writing instruction with the drafted prose.
 *
 * Works on the paragraph sequence rather than on the raw string, because the
 * target is positional: the instruction is whatever bracketed paragraph follows
 * a given heading. A blind search-and-replace cannot express "the bracketed
 * text under Scope" and would happily rewrite the identical instruction under
 * Background.
 *
 * The paragraph's first run takes the new text and the rest are emptied rather
 * than removed. Word stores formatting per run, so deleting them would drop the
 * paragraph's styling, and an emptied run renders as nothing.
 */
/** Lines that carry the structure of a section and should read as headings. */
function isStructuralHeading(line: string): boolean {
  if (line.length > 80) return false;
  return (
    /^Phase\s+\d+\b/i.test(line) ||
    /^(Methodology|Sequencing Rationale|Measurement|Key Risks and Challenges)\s*:?$/i.test(line)
  );
}

/**
 * One drafted line as its own Word paragraph, modelled on the template's.
 *
 * The whole section used to go into a single paragraph with `<w:br/>` between
 * its parts. Word treats a line break as a break *within* a paragraph, so
 * `spacing after` never applied and a 2,246-word Technical Description arrived
 * as one unbroken wall with "Methodology" flush against the sentence beneath
 * it. Real paragraphs get real spacing, and they are editable one at a time.
 */
function renderParagraph(templateParagraph: string, text: string): string {
  let first = true;
  let out = templateParagraph.replace(
    /(<w:t[^>]*>)([^<]*)(<\/w:t>)/g,
    (_all, open: string, _old: string, close: string) => {
      if (!first) return `${open}${close}`;
      first = false;
      const tag = open.includes("xml:space") ? open : open.replace(/>$/, ' xml:space="preserve">');
      return `${tag}${esc(text)}${close}`;
    }
  );

  // Space after. These paragraphs carry w:after="0", which was harmless while
  // everything was one paragraph and is the whole problem once it is not.
  if (/<w:spacing[^>]*w:after="\d+"/.test(out)) {
    out = out.replace(/(<w:spacing[^>]*w:after=")\d+(")/, `$1160$2`);
  } else if (/<w:spacing[^>]*\/>/.test(out)) {
    out = out.replace(/<w:spacing([^>]*)\/>/, '<w:spacing$1 w:after="160"/>');
  } else if (/<w:pPr>/.test(out)) {
    out = out.replace("<w:pPr>", '<w:pPr><w:spacing w:after="160"/>');
  }

  if (isStructuralHeading(text)) {
    // Bold the first run only, which is the one carrying the text.
    let bolded = false;
    out = out.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/g, (all, inner: string) => {
      if (bolded) return all;
      bolded = true;
      const withoutOff = inner.replace(/<w:b w:val="0"\/>/g, "").replace(/<w:bCs w:val="0"\/>/g, "");
      return `<w:rPr><w:b w:val="1"/><w:bCs w:val="1"/>${withoutOff}</w:rPr>`;
    });
  }
  return out;
}

function injectSections(
  xml: string,
  sections: Record<string, string>
): { xml: string; written: number; dropped: string[] } {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  if (!paragraphs) return { xml, written: 0, dropped: Object.keys(sections) };

  const textOf = (p: string) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
  const isHeading = (p: string) => /<w:pStyle w:val="Heading[12]"/.test(p);

  // Headings are matched loosely - the template writes "Representations &amp;
  // Certifications" in the XML and "Representations & Certifications" is what a
  // caller will pass.
  // Dashes are normalised too. The template writes "Appendix A \u2013 Completed RFP"
  // with an en dash and the section list uses a hyphen, so all three appendices
  // matched nothing and were dropped - silently, until droppedSections started
  // reporting it. Three of fourteen sections had never reached the document.
  const normalise = (t: string) =>
    t
      .replace(/&amp;/g, "&")
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const wanted = new Map(Object.entries(sections).map(([k, v]) => [normalise(k), v]));
  // Kept so a dropped section can be reported under the heading the caller
  // actually used, rather than the lowercased form matching works on.
  const originalName = new Map(Object.entries(sections).map(([k]) => [normalise(k), k]));

  let written = 0;
  let currentHeading: string | null = null;
  /** Headings that received a draft, so leftover instructions under them can
   *  be cleared. `wanted` cannot answer this: an entry is deleted the moment
   *  it is used, so the paragraph after the one just filled looks like a
   *  heading nobody wrote for. */
  const filled = new Set<string>();
  /** Content paragraphs seen under each heading so far, so the second one can
   *  be identified without relying on how it is punctuated. */
  const seenUnder = new Map<string, number>();
  const out = paragraphs.map((p) => {
    if (isHeading(p)) {
      currentHeading = normalise(textOf(p));
      return p;
    }
    if (!currentHeading) return p;

    const body = wanted.get(currentHeading);
    const text = textOf(p);

    // Instructions still standing under a heading that has already been
    // written are template guidance, not content. Terms and Conditions carries
    // a second, conditional one - "If the offer is not submitted on SF 1449,
    // include a statement specifying the extent of agreement" - which is about
    // a federal form and has nothing to do with a Virginia town's RFP. It rode
    // into the finished document in red, reading like an unfilled field on a
    // proposal that was otherwise complete.
    //
    // Only red is cleared. Black text under these headings is Caravann's own
    // lead sentence and stays.
    if (!body && text && filled.has(currentHeading)) {
      const isInstruction = /<w:color\s+w:val="(?:ff0000|c00000)"/i.test(p);
      return isInstruction ? p.replace(/(<w:t[^>]*>)[^<]*(<\/w:t>)/g, "$1$2") : p;
    }
    if (!body || !text) return p;

    // The first paragraph under a heading is Caravann's own lead sentence and
    // must survive - it is the one carrying the company name and solicitation
    // number. The second is the writing instruction, and that is what the
    // draft replaces.
    //
    // Position, not shape. Most instructions are wrapped in square brackets but
    // not all: under Technical Description it is unbracketed FAR guidance
    // ("A technical description of the items being offered..."), and a
    // bracket test silently skipped it.
    seenUnder.set(currentHeading, (seenUnder.get(currentHeading) ?? 0) + 1);
    const nth = seenUnder.get(currentHeading) ?? 0;

    if (nth !== 2) return p;

    wanted.delete(currentHeading);
    filled.add(currentHeading);
    written++;

    // One Word paragraph per line of drafted prose. Blank lines are dropped
    // rather than preserved: the spacing between paragraphs is what separates
    // the blocks now, so keeping them would double every gap.
    const lines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const rendered = (lines.length ? lines : [body]).map((line) => renderParagraph(p, line)).join("");
    return clearFilledColour(rendered);
  });

  let i = 0;
  // Whatever is left in `wanted` never found its heading. That is the whole
  // signal: the template has fourteen headings and a section keyed to anything
  // else has nowhere to go.
  const dropped = [...wanted.keys()].map((k) => originalName.get(k) ?? k);
  return { xml: xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, () => out[i++]), written, dropped };
}


/**
 * Make the footer's page number readable, and put it at the right margin.
 *
 * Two departures from copying the template, and the only ones in this file.
 * Both are cases where the template is plainly not what anyone intended.
 *
 * Size: the run holding the PAGE field is set to `w:sz="8"` - four points,
 * against eleven for the firm and website beside it. At that size it reads as a
 * speck of dirt. That is not a decision anybody made; it is what happens when a
 * page-number field is pasted in and picks up the clipboard's formatting.
 *
 * Position: the paragraph is centred and carries **seven literal tabs** between
 * the text and the field - someone tabbing the number across by hand. Centring
 * aligns a paragraph's whole content as one block, so every one of those tabs
 * collapses to nothing and the number lands directly under the text. Seven tabs
 * is the tell: it only gets typed that many times when the first six visibly
 * did nothing.
 *
 * Replaced with what was meant: left alignment, a centre stop and a right stop,
 * one tab before the text and one before the field. The text sits centred, the
 * number goes to the right margin, and both hold whatever the page count
 * reaches.
 */
/**
 * Put a value into a "Label: (Enter something)" line.
 *
 * These lines are two runs: a black label and a red instruction. Writing into
 * the second run and leaving the first alone keeps the label's formatting and
 * puts the value where a reader expects it.
 *
 * `supplied` decides the colour. A real value clears the red, so the line reads
 * as finished. A value we do not have keeps the red and says so in four words
 * instead of thirty, which leaves the document honest and tells Khaled exactly
 * what he still owes it.
 */
function setLabelledValue(paragraph: string, value: string, supplied: boolean): string {
  const slots = [...paragraph.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)];
  if (slots.length < 2) return paragraph;

  // Half these labels keep the colon in the label run ("Contract#/Purchase
  // Order#:") and half leave it at the head of the value run we overwrite
  // ("Agency/Business" + ": (Enter name...)"). Overwriting blindly produced
  // "Agency/Business San Francisco County Transportation Authority", so the
  // colon goes back when the label does not already end in one.
  const separator = /:\s*$/.test(slots[0][1]) ? " " : ": ";

  // Where the instruction actually is. These paragraphs are not two runs: the
  // label is followed by one or more *empty* black runs and only then the red
  // "(Enter ...)" text. Writing into the second slot therefore put the value in
  // an empty black run and blanked the red one, so a field nobody has supplied
  // rendered as though it were finished. The value has to land on the run that
  // held the instruction, which is the one that carries the colour.
  // Word content, not merely non-empty. Every one of these lines is four runs:
  // the label, a black ": " separator, the red instruction, then an empty run.
  // Testing for non-empty text matched the separator, so the value landed in a
  // black run and only the one line whose separator happens to be a bare space
  // came out red.
  let target = slots.findIndex((slot, i) => i > 0 && /[A-Za-z0-9]/.test(slot[1]));
  if (target === -1) target = 1;

  let seen = -1;
  const out = paragraph.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_all, open: string, old: string, close: string) => {
    seen++;
    if (seen === 0) return `${open}${old}${close}`;
    if (seen !== target) return `${open}${close}`;
    const tag = open.includes("xml:space") ? open : open.replace(/>$/, ' xml:space="preserve">');
    return `${tag}${separator}${esc(value)}${close}`;
  });
  return supplied ? clearFilledColour(out) : out;
}

/**
 * Fill the three numbered past-performance blocks and name them.
 *
 * The headings ship as "Past Performance#1:" with nothing after the colon. A
 * reference block that does not say who it is about makes the reader hunt for
 * the agency name in the body, so the client's name goes into the heading.
 */
function injectPastPerformance(
  xml: string,
  entries: PastPerformanceEntry[]
): { xml: string; filled: number } {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  if (!paragraphs) return { xml, filled: 0 };

  const textOf = (p: string) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();

  // Label to value, resolved per entry. Order follows the template.
  const fieldFor = (e: PastPerformanceEntry, label: string): { value: string; supplied: boolean } | null => {
    // Braced, because it has to read as a slot and not as a sentence.
    //
    // "To be supplied by Caravann." is grammatical prose sitting where a
    // contract number should be. Skimmed, it looks like a statement the firm is
    // making rather than a hole in the submission, and the red that marks it is
    // exactly what a printed or forwarded copy loses first. Braces survive
    // black and white, a screenshot and a PDF, and nobody mistakes them for
    // something the author meant to say.
    const pending = "{to be supplied by Caravann}";
    const known = (v: string | null | undefined) =>
      v && v.trim() ? { value: v.trim(), supplied: true } : { value: pending, supplied: false };
    if (/^Contract#/i.test(label)) return known(e.contractNumber);
    if (/^Agency\/Business/i.test(label)) return { value: e.client, supplied: true };
    if (/^Contract Amount/i.test(label)) return known(e.amount);
    if (/^Contract type/i.test(label)) return known(e.contractType);
    if (/^Period of performance/i.test(label)) return known(e.period);
    if (/^Project Role/i.test(label)) return known(e.role);
    if (/^Name \/ Title/i.test(label)) return known(e.referenceName);
    if (/^Phone/i.test(label)) return known(e.referencePhone);
    if (/^Email/i.test(label)) return known(e.referenceEmail);
    if (/^Description of services/i.test(label)) return { value: e.description, supplied: true };
    return null;
  };

  let current = -1;
  let filled = 0;
  const out = paragraphs.map((p) => {
    const text = textOf(p);
    // Heading style required. The table of contents carries its own copy of
    // every heading ("Past Performance#1:3", the 3 being a page number), and
    // matching on text alone renamed those too, so the contents page listed an
    // engagement while the body kept the placeholder.
    const numbered = /<w:pStyle w:val="Heading[12]"/.test(p)
      ? text.match(/^Past Performance\s*#\s*(\d+)\s*:?/i)
      : null;
    if (numbered) {
      const index = Number(numbered[1]) - 1;
      current = index < entries.length ? index : -1;
      if (current === -1) return p;
      // Rename the heading to the engagement it describes.
      let first = true;
      return p.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_all, open: string, _old: string, close: string) => {
        if (!first) return `${open}${close}`;
        first = false;
        const tag = open.includes("xml:space") ? open : open.replace(/>$/, ' xml:space="preserve">');
        return `${tag}Past Performance #${index + 1}: ${esc(entries[index].client)}${close}`;
      });
    }
    // A Heading1 ends the run of numbered blocks.
    if (/<w:pStyle w:val="Heading1"/.test(p)) { current = -1; return p; }
    if (current === -1 || !text) return p;

    const field = fieldFor(entries[current], text);
    if (!field) return p;
    filled++;
    return setLabelledValue(p, field.value, field.supplied);
  });

  let i = 0;
  return { xml: xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, () => out[i++]), filled };
}

/**
 * Give the appendix headings a body.
 *
 * They ship as bare headings with no paragraph under them, so `injectSections`
 * had nothing to write into and all three came out as a title over white space.
 * A paragraph is built and inserted rather than substituted, because there is
 * nothing there to substitute.
 */
function injectAppendices(xml: string, bodies: Record<string, string>): { xml: string; filled: number } {
  const normalise = (t: string) =>
    t.replace(/&amp;/g, "&").replace(/[\u2010-\u2015]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = new Map(Object.entries(bodies).map(([k, v]) => [normalise(k), v]));

  let filled = 0;
  const out = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
    if (!/<w:pStyle w:val="Heading1"/.test(p)) return p;
    const text = [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
    const body = wanted.get(normalise(text));
    if (!body) return p;
    wanted.delete(normalise(text));
    filled++;
    // Red, because every one of these is a document somebody still has to
    // attach. Black would say it was already done.
    //
    // The brace is the marker rather than any particular wording. Matching on
    // "to be attached" meant a rephrase silently turned a placeholder black,
    // and a placeholder that does not look like one is worse than no marker at
    // all.
    const needsAttention = body.includes("{");
    const colour = needsAttention ? '<w:color w:val="ff0000"/>' : "";
    const para =
      '<w:p><w:pPr><w:spacing w:after="120"/><w:rPr>' + colour + '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>' +
      '<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>' +
      colour + '<w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr>' +
      '<w:t xml:space="preserve">' + esc(body) + "</w:t></w:r></w:p>";
    return p + para;
  });
  return { xml: out, filled };
}

/**
 * Fill the solicitation amendments table.
 *
 * The template ships three empty rows under the header. They are written into
 * rather than added to, so the table keeps its own borders and widths.
 */
function fillAmendments(xml: string, rows: { label: string; date: string }[]): { xml: string; filled: number } {
  let filled = 0;
  const out = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    if (!table.includes("Solicitation / Amendment")) return table;
    let r = -1;
    return table.replace(/<w:tr[ >][\s\S]*?<\/w:tr>/g, (row) => {
      r++;
      if (r === 0) return row; // header
      const entry = rows[r - 1];
      if (!entry) return row;
      filled++;
      let cell = -1;
      return row.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, (tc) => {
        cell++;
        const value = cell === 0 ? entry.label : cell === 1 ? entry.date : "";
        if (!value) return tc;
        // The empty rows carry a run with no <w:t> at all, so one is added.
        // `<w:tcPr/>` also begins with "<w:t", so a substring test says every
        // cell already holds text and the table came out empty. The character
        // after the tag name is what separates `<w:t>` from `<w:tcPr>`.
        const written = /<w:t[ >]/.test(tc)
          ? tc.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/, (_a, open: string, _o: string, close: string) => `${open}${esc(value)}${close}`)
          : tc.replace(/(<w:r[ >][^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?)(<\/w:r>)/, (_a, open: string, close: string) => `${open}<w:t xml:space="preserve">${esc(value)}</w:t>${close}`);
        return clearFilledColour(written);
      });
    });
  });
  return { xml: out, filled };
}

/**
 * Name the document's default font, because the template never does.
 *
 * `docDefaults` in this template sets a size and a language and no `w:rFonts`
 * at all, and the `Normal` style it points at is empty. So for 92% of the text
 * nothing in the whole style chain says which family to use, and each
 * application substitutes its own: Word reaches for Aptos or Calibri, Google
 * Docs for Arial. The remaining 8% - the past-performance blocks and the
 * appendix paragraphs - name Times New Roman explicitly, which is what the
 * heading style and Caravann's own submitted proposal use.
 *
 * The result is a document that renders in two fonts, and which two depends on
 * where you open it. Declaring the default is what makes it one.
 *
 * Times New Roman rather than anything else because that is what the template
 * already commits to everywhere it commits to anything: Heading1, and every
 * run in the past-performance blocks it shipped with.
 */
/** Fonts that carry glyphs rather than letters. Rewriting these breaks bullets. */
const GLYPH_FONTS = /^(Symbol|Wingdings|Webdings|Courier New)/i;

/**
 * One typeface, and no en or em dashes, across a document part.
 */
function houseStyle(xml: string): string {
  const out = xml.replace(/<w:rFonts\b[^>]*\/>/g, (tag) => {
    const named = tag.match(/w:ascii="([^"]*)"/)?.[1] ?? "";
    if (GLYPH_FONTS.test(named)) return tag;
    return tag.replace(/w:(ascii|hAnsi|cs|eastAsia)="[^"]*"/g, (attr, which) =>
      `w:${which}="Times New Roman"`,
    );
  });
  // Only inside text, so an attribute value or a field instruction is untouched.
  return out.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_m, open, text, close) =>
    `${open}${text.replace(/[\u2013\u2014]/g, "-")}${close}`,
  );
}

function setDefaultFont(styles: string): string {
  // The block first, then the test inside it. Testing the whole file for
  // `<w:docDefaults>[\s\S]*?<w:rFonts` looks scoped and is not: the lazy
  // quantifier keeps going until it finds an rFonts *anywhere* after the
  // opening tag, and Heading1 has one, so the guard reported the font was
  // already set and returned the styles untouched.
  const block = styles.match(/<w:docDefaults>[\s\S]*?<\/w:docDefaults>/);
  if (!block) return styles;
  if (block[0].includes("<w:rFonts")) return styles;

  const font =
    '<w:rFonts w:ascii="Times New Roman" w:cs="Times New Roman" ' +
    'w:eastAsia="Times New Roman" w:hAnsi="Times New Roman"/>';
  const patched = block[0].replace("<w:rPr>", `<w:rPr>${font}`);
  return styles.replace(block[0], patched);
}

/**
 * Keep the contents page to the eleven sections, not their subheadings.
 *
 * The template's field reads `TOC \t "Heading 1,1,Heading 2,2,Heading 3,3"`, so
 * it lists every Heading 2 as well. The only Heading 2s in the document are the
 * three numbered past-performance blocks, which are part of Past Performance
 * rather than sections of the proposal. A contents page that reads
 *
 *     5. Past Performance
 *        Past Performance #1: ...
 *        Past Performance #2: ...
 *        Past Performance #3: ...
 *
 * gives three of its fourteen lines to one section's internals.
 *
 * Both halves have to change. The field instruction governs what Word rebuilds
 * on open; the cached entries are what a reader sees before anything rebuilds,
 * and Google Docs in particular will not rebuild it at all. Cached level-two
 * entries are recognised by their indent: the template sets 900 twips for level
 * one and 810 for level two.
 */
function tocTopLevelOnly(xml: string): string {
  // What a rebuild will pick up.
  let out = xml.replace(
    /(TOC[^<"]*?\\t\s*&quot;)Heading 1,1,Heading 2,2,Heading 3,3[^&]*(&quot;)/g,
    "$1Heading 1,1$2",
  );

  // What is on the page until then.
  out = out.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!paragraph.includes("<w:hyperlink")) return paragraph;
    const indent = paragraph.match(/<w:ind[^>]*w:left="(\d+)"/);
    if (!indent || indent[1] !== "810") return paragraph;
    return "";
  });

  return out;
}

function fixFooter(xml: string): string {
  // Two shapes to handle. In footer2 and footer3 the text and the field share a
  // paragraph. In footer1 - which is what page 2 actually uses, because section
  // two defines only a first-page footer and later pages fall back to the
  // previous section's - they are separate paragraphs, so the number sits on
  // its own line however the tab stops are set. That one has to be merged
  // before anything else will help.
  const merged = mergePageNumberIntoText(xml);

  return merged.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!/PAGE/.test(paragraph)) return paragraph;

    let out = paragraph
      .replace(/<w:sz w:val="8"\/>/g, '<w:sz w:val="22"/>')
      .replace(/<w:szCs w:val="8"\/>/g, '<w:szCs w:val="22"/>')
      .replace(/<w:jc w:val="center"\/>/g, "");

    const stops =
      '<w:tabs><w:tab w:val="center" w:pos="4680"/><w:tab w:val="right" w:pos="9360"/></w:tabs>';
    out = /<w:pPr>/.test(out)
      ? out.replace("<w:pPr>", `<w:pPr>${stops}`)
      : out.replace(/(<w:p[ >][^>]*>)/, `$1<w:pPr>${stops}</w:pPr>`);

    out = out.replace(/(?:<w:tab\/>\s*){2,}/g, "<w:tab/>");

    // `<w:t[^>]*>` would also match `<w:tabs>` - "abs" satisfies [^>]* - which
    // put this tab among the stop definitions where it did nothing.
    if (!/<w:tab\/>\s*<w:t[ >]/.test(out)) out = out.replace(/(<w:t[ >])/, "<w:tab/>$1");

    return out;
  });
}

/**
 * Pull a lone page-number paragraph up into the text paragraph above it.
 *
 * `footer1` keeps "Caravann Consulting / www.caravann.co" in one paragraph and
 * the PAGE field in the next. Two paragraphs are two lines, so no arrangement
 * of tab stops within either will ever put them side by side - the number has
 * to move into the same paragraph first.
 *
 * The field's runs are appended to the text paragraph with a tab between them,
 * and the emptied paragraph is dropped.
 */
function mergePageNumberIntoText(xml: string): string {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  if (!paragraphs) return xml;

  const hasText = (p: string) =>
    [...p.matchAll(/<w:t[ >][^>]*>([^<]*)<\/w:t>|<w:t>([^<]*)<\/w:t>/g)]
      .map((m) => m[1] ?? m[2])
      .join("")
      .trim().length > 0;

  const fieldIndex = paragraphs.findIndex((p) => /PAGE/.test(p) && !hasText(p));
  if (fieldIndex < 1) return xml;

  // The nearest text paragraph above it is the one the number belongs beside.
  let textIndex = -1;
  for (let i = fieldIndex - 1; i >= 0; i--) {
    if (hasText(paragraphs[i])) { textIndex = i; break; }
  }
  if (textIndex < 0) return xml;

  const fieldRuns = (paragraphs[fieldIndex].match(/<w:r[ >][\s\S]*?<\/w:r>/g) || []).join("");
  if (!fieldRuns) return xml;

  const combined = paragraphs[textIndex].replace(/<\/w:p>$/, `<w:r><w:tab/></w:r>${fieldRuns}</w:p>`);

  let i = 0;
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, () => {
    const at = i++;
    if (at === textIndex) return combined;
    if (at === fieldIndex) return "";
    return paragraphs[at];
  });
}

