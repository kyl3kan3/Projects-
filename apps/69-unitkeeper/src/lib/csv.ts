/**
 * CSV, written by hand because a spreadsheet export is not worth a dependency and
 * because the quoting rules are the whole job.
 *
 * Two things it does that a naive `join(",")` does not:
 *  - quotes any field containing a comma, quote, newline or leading space, and
 *    doubles embedded quotes (RFC 4180);
 *  - prefixes a leading `=`, `+`, `-` or `@` with an apostrophe, so a unit note
 *    reading `=cmd|…` is text in Excel rather than a formula.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: readonly string[], rows: readonly unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  // CRLF: the keypad importers in this category are Windows software.
  return `${lines.join("\r\n")}\r\n`;
}

export function csvResponse(filename: string, body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

/** Cents as a plain decimal, for a column something else will total. */
export function csvMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
