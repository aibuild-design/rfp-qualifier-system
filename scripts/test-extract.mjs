#!/usr/bin/env node
// Format detection and text extraction, against real files rather than mocks.
//
//   npm run test:extract
//
// The .docx is generated here so the test needs nothing on disk. The PDF is
// fetched once from a stable public URL; without network the PDF checks skip
// rather than fail, and say so.

import { Document, Packer, Paragraph } from "docx";
import { extractText, sniffFormat, htmlToText, looksUnusable } from "../lib/extract.ts";

let passed = 0;
const failures = [];
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const enc = (s) => new TextEncoder().encode(s);

console.log("\nFormat sniffing (by bytes, not by extension)");
{
  check("recognises a PDF by its header", sniffFormat(enc("%PDF-1.7\nrest")) === "pdf");
  check("recognises a zip container as docx", sniffFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])) === "docx");
  check(
    "recognises legacy .doc (OLE compound file)",
    sniffFormat(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])) === "doc"
  );
  check("recognises HTML", sniffFormat(enc("<!DOCTYPE html><html><body>hi</body></html>")) === "html");
  check("recognises plain text", sniffFormat(enc("Request for Proposals\nDue October 30")) === "text");

  // The failure that actually happens in the wild: a link ending .pdf that
  // serves a login page. The bytes decide, so the lie does not propagate.
  check(
    "a login page served as application/pdf is still detected as HTML",
    sniffFormat(enc("<html><body>Please sign in</body></html>"), "application/pdf") === "html"
  );
}

console.log("\nWord (.docx) - the format n8n cannot read at all");
{
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph("REQUEST FOR PROPOSALS"),
          new Paragraph("Strategic Planning and Board Facilitation Services"),
          new Paragraph("The not-to-exceed amount for this engagement is $150,000."),
          new Paragraph("Proposals are due October 30, 2026 at 4:00 PM Pacific."),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  const bytes = new Uint8Array(buffer);

  check("a real .docx is detected as docx", sniffFormat(bytes) === "docx");

  const out = await extractText(bytes);
  check("extracts the heading", out.text.includes("REQUEST FOR PROPOSALS"), out.text.slice(0, 80));
  check("extracts the budget line", out.text.includes("$150,000"));
  check("extracts the deadline line", out.text.includes("October 30, 2026"));
  check("reports the format it read", out.format === "docx", out.format);
  check("reports a character count", out.chars > 100, String(out.chars));
}

console.log("\nHTML and plain text");
{
  const html = `<html><head><style>p{color:red}</style><script>var x=1</script></head>
    <body><h1>Request for Proposals</h1><p>Due&nbsp;October 30, 2026.</p>
    <p>Budget is $150,000 &amp; firm.</p></body></html>`;
  const text = htmlToText(html);
  check("drops script and style content", !text.includes("var x") && !text.includes("color:red"), text.slice(0, 60));
  check("decodes entities", text.includes("October 30, 2026") && text.includes("&"), text.slice(0, 80));
  check("keeps the prose", text.includes("Request for Proposals") && text.includes("$150,000"));

  const plain = await extractText(enc("RFP 2026-11\nDue October 30, 2026.\n" + "x".repeat(500)));
  check("plain text passes through", plain.format === "text" && plain.text.includes("RFP 2026-11"));
}

console.log("\nRefusing to triage what was never read");
{
  const short = looksUnusable("too short", "pdf");
  check("flags a near-empty extraction", Boolean(short), short);

  const login = looksUnusable(
    "Sign in to continue. Username. Password. Create an account to access this portal. " + "y".repeat(500),
    "html"
  );
  check("flags a portal login page", Boolean(login), login);

  const real =
    "REQUEST FOR PROPOSALS. Scope of work: facilitation. Proposals due October 30. Submittal instructions follow. " +
    "z".repeat(500);
  check("does not flag a genuine solicitation", looksUnusable(real, "pdf") === undefined);

  const legacy = await extractText(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]));
  check("legacy .doc returns a usable instruction, not a crash", legacy.warning?.includes(".docx"), legacy.warning);
}

console.log("\nPDF (real file over the network)");
try {
  const res = await fetch("https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf", {
    signal: AbortSignal.timeout(15000),
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  check("a real PDF is detected as pdf", sniffFormat(bytes) === "pdf");
  const out = await extractText(bytes);
  check("extracts text from a real PDF", out.text.toLowerCase().includes("dummy"), out.text.slice(0, 60));
  check("reports pdf as the format", out.format === "pdf");
} catch (err) {
  console.log(`  · skipped - no network (${err.message})`);
}

console.log(`\n${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  ✗ ${f.name}${f.detail ? ` - ${f.detail}` : ""}`));
  process.exit(1);
}
