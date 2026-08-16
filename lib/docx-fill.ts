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
  const keep = (value: string | undefined, placeholder: string) => value?.trim() || placeholder;
  return [
    ["[Insert Company Name]", COMPANY],
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
    ["[Insert Offeror Name]", COMPANY],
    ["[Insert Offeror Address]", "2008 Ninth St, Berkeley, CA 94701"],
    ["[Insert Offeror Point of Contact:]", "Khaled El-Sawaf"],
    ["[Insert Offeror Telephone]", "510-224-0070"],
    ["[Insert Offeror Email]", "khaled@caravann.co"],
    ["[Insert Offeror Website]", "https://www.caravann.co"],
    ["[Insert Offeror CAGE Code]", "9NV03"],
    ["[Insert Offeror UEI#]", "HSV8KJY684V5"],
    ["[Insert Offeror DUNS#]", "N/A - replaced by UEI (April 2022)"],
    ["[Insert Offeror TAX EIN#]", "92-1867651"],
    ["[Insert Agency Name]", esc(keep(v.agencyName, "[Insert Agency Name]"))],
    ["[Insert Agency Address]", esc(keep(v.agencyAddress, "[Insert Agency Address]"))],
    ["[Insert Agency POC Telephone]", esc(keep(v.agencyPocPhone, "[Insert Agency POC Telephone]"))],
    ["[Insert Agency POC Email]", esc(keep(v.agencyPocEmail, "[Insert Agency POC Email]"))],
    // Last, because "[Insert Agency POC]" is a prefix of the two above and
    // would otherwise consume them.
    ["[Insert Agency POC]", esc(keep(v.agencyPocName, "[Insert Agency POC]"))],
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
      return segment.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_all, open: string, _old: string, close: string) => {
        if (!first) return `${open}${close}`;
        first = false;
        const tag = open.includes("xml:space") ? open : open.replace(/>$/, ' xml:space="preserve">');
        return `${tag}${replaced}${close}`;
      });
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
  const normalise = (t: string) =>
    t.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = new Map(Object.entries(sections).map(([k, v]) => [normalise(k), v]));
  // Kept so a dropped section can be reported under the heading the caller
  // actually used, rather than the lowercased form matching works on.
  const originalName = new Map(Object.entries(sections).map(([k]) => [normalise(k), k]));

  let written = 0;
  let currentHeading: string | null = null;
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
    if (seenUnder.get(currentHeading) !== 2) return p;

    wanted.delete(currentHeading);
    written++;

    let first = true;
    return p.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_all, open: string, _old: string, close: string) => {
      if (!first) return `${open}${close}`;
      first = false;
      // xml:space="preserve" so leading and trailing spaces in the prose are
      // not collapsed by Word.
      const tag = open.includes("xml:space") ? open : open.replace(/>$/, ' xml:space="preserve">');
      return `${tag}${esc(body)}${close}`;
    });
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

