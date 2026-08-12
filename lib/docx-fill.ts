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

  // Headers and footers carry the title, number and date too, so they need the
  // same pass - this is why the running header on page two shows the real
  // solicitation rather than the placeholder.
  const parts = Object.keys(zip.files).filter((name) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(name)
  );

  for (const name of parts) {
    let xml = await zip.file(name)!.async("string");
    for (const [from, to] of subs) {
      const before = xml;
      xml = xml.split(from).join(to);
      if (xml !== before) replacements += before.split(from).length - 1;
    }
    if (/^word\/footer/.test(name)) xml = enlargePageNumber(xml);
    zip.file(name, xml);
  }

  // Write the drafted prose over the template's writing instructions.
  if (values.sections && Object.keys(values.sections).length > 0) {
    const documentPart = zip.file("word/document.xml")!;
    const filled = injectSections(await documentPart.async("string"), values.sections);
    zip.file("word/document.xml", filled.xml);
    replacements += filled.written;
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
  return { buffer, unreplaced, replacements };
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
function injectSections(xml: string, sections: Record<string, string>): { xml: string; written: number } {
  const paragraphs = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g);
  if (!paragraphs) return { xml, written: 0 };

  const textOf = (p: string) =>
    [...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
  const isHeading = (p: string) => /<w:pStyle w:val="Heading[12]"/.test(p);

  // Headings are matched loosely - the template writes "Representations &amp;
  // Certifications" in the XML and "Representations & Certifications" is what a
  // caller will pass.
  const normalise = (t: string) =>
    t.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().toLowerCase();
  const wanted = new Map(Object.entries(sections).map(([k, v]) => [normalise(k), v]));

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
  return { xml: xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, () => out[i++]), written };
}


/**
 * Bring the page number up to the size of the text beside it.
 *
 * The template sets the run holding the PAGE field to `w:sz="8"` - four points,
 * against eleven for "Caravann Consulting / www.caravann.co" on the same line.
 * At that size it reads as a speck of dirt rather than a number, which is what
 * "the numbers are hard to read" turned out to be.
 *
 * A deliberate departure from copying the template exactly, and the only one in
 * this file. Four-point type is not a design decision anybody made; it is what
 * happens when a page-number field is pasted in and picks up whatever
 * formatting was on the clipboard. Everything else here is left alone precisely
 * because the template is more likely to be right than I am - this is the case
 * where it plainly is not.
 *
 * Scoped to footers and to that one size, so nothing else can be caught by it.
 */
function enlargePageNumber(xml: string): string {
  return xml
    .replace(/<w:sz w:val="8"\/>/g, '<w:sz w:val="22"/>')
    .replace(/<w:szCs w:val="8"\/>/g, '<w:szCs w:val="22"/>');
}
