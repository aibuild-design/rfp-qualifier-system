/**
 * Turn a downloaded solicitation into plain text, whatever format it arrived in.
 *
 * The SOW's Module 01 promises "PDF and Word text extraction". n8n's own
 * Extract From File node covers PDF, text, HTML and a few spreadsheet formats
 * but has no .docx path at all, and agencies post .docx constantly — so this
 * lives in the app, where a real library can do it.
 *
 * The format is decided by looking at the bytes, not by trusting the file
 * extension or the server's Content-Type. Both lie routinely: agency portals
 * serve PDFs as application/octet-stream, and a link ending in .pdf frequently
 * returns an HTML login page. Getting this wrong is not cosmetic — an HTML
 * error page parsed as a solicitation produces a confident verdict about a
 * document nobody read.
 */

export type DocumentFormat = "pdf" | "docx" | "doc" | "html" | "text" | "unknown";

export type Extraction = {
  text: string;
  format: DocumentFormat;
  chars: number;
  /** Set when the text is probably not a solicitation, so the caller can stop
   *  rather than triage a login page. */
  warning?: string;
};

/**
 * Identify a file from its leading bytes.
 *
 * - PDF  : "%PDF-"
 * - DOCX : a ZIP ("PK\x03\x04") — every Office Open XML file is a zip archive
 * - DOC  : the old OLE compound-file magic, which we can detect but not read
 */
export function sniffFormat(bytes: Uint8Array, contentType = ""): DocumentFormat {
  const head = Array.from(bytes.slice(0, 8));
  const ascii = String.fromCharCode(...head);

  if (ascii.startsWith("%PDF-")) return "pdf";
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "doc";
  if (ascii.startsWith("PK\x03\x04")) return "docx";

  // Not a container format — decide between markup and plain text.
  const sample = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.slice(0, 2048))
    .trimStart()
    .toLowerCase();
  if (sample.startsWith("<!doctype html") || sample.startsWith("<html") || sample.startsWith("<?xml")) {
    return "html";
  }
  if (contentType.includes("html")) return "html";
  if (contentType.includes("text/") || contentType.includes("json")) return "text";

  // Mostly-printable bytes are text; anything else is a format we don't know.
  const printable = bytes.slice(0, 512).reduce((n, b) => n + (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) ? 1 : 0), 0);
  return printable / Math.min(bytes.length, 512) > 0.85 ? "text" : "unknown";
}

/** Strip tags, scripts and styles. Deliberately crude: the goal is readable
 *  prose for a model, not faithful rendering. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Signals that what came back is a portal login or an error page rather than a
 * solicitation. Worth saying out loud: the most common real-world failure is
 * not a corrupt PDF, it is a link that quietly resolves to "please sign in".
 */
export function looksUnusable(text: string, format: DocumentFormat): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length < 400) {
    return `Only ${trimmed.length} characters of text came out of this ${format} — it is very likely a scanned image, a cover page, or an error page rather than the solicitation.`;
  }
  const lower = trimmed.slice(0, 1500).toLowerCase();
  const loginish = ["sign in", "log in", "login", "username", "password", "create an account"];
  const hits = loginish.filter((w) => lower.includes(w)).length;
  const solicitationish = ["proposal", "solicitation", "rfp", "rfq", "scope of work", "due date", "submittal"];
  const real = solicitationish.filter((w) => lower.includes(w)).length;
  if (format === "html" && hits >= 2 && real === 0) {
    return "This looks like a portal login page, not a solicitation. Download the document and paste its text instead.";
  }
  return undefined;
}

/** Extract text from a downloaded document. */
export async function extractText(
  bytes: Uint8Array,
  contentType = ""
): Promise<Extraction> {
  const format = sniffFormat(bytes, contentType);
  let text = "";

  switch (format) {
    case "pdf": {
      // unpdf ships a serverless build of pdf.js — no native modules, no
      // filesystem, which is what makes it usable on Vercel.
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const doc = await getDocumentProxy(bytes);
      const { text: pages } = await pdfText(doc, { mergePages: true });
      text = String(pages);
      break;
    }
    case "docx": {
      const mammoth = (await import("mammoth")).default;
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = value;
      break;
    }
    case "doc":
      return {
        text: "",
        format,
        chars: 0,
        warning:
          "This is a legacy .doc file, which cannot be read directly. Open it and re-save as .docx or PDF, or paste the text in.",
      };
    case "html":
      text = htmlToText(new TextDecoder().decode(bytes));
      break;
    case "text":
      text = new TextDecoder().decode(bytes);
      break;
    default:
      return {
        text: "",
        format,
        chars: 0,
        warning:
          "The file is in a format this system cannot read. Paste the solicitation text in instead.",
      };
  }

  text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, format, chars: text.length, warning: looksUnusable(text, format) };
}
