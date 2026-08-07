/**
 * Minimal RFC 4180 CSV writer.
 *
 * Hand-rolled rather than pulled in as a dependency because the requirements
 * are small and fixed, but the escaping is not optional: agency names contain
 * commas ("County of Stanislaus, Behavioral Health"), verdict reasoning
 * contains quotes and newlines, and any of those unescaped silently corrupts
 * every column after it.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(","));
  }
  // CRLF per the spec — Excel is the likeliest consumer and is happiest with it.
  return lines.join("\r\n");
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);

  // A leading =, +, - or @ makes Excel and Sheets treat the cell as a formula.
  // Solicitation text is untrusted input that lands in a spreadsheet someone
  // opens, so neutralise it rather than hoping no agency ever starts a line
  // with a minus sign.
  const needsGuard = /^[=+\-@\t\r]/.test(s);
  const guarded = needsGuard ? `'${s}` : s;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}
