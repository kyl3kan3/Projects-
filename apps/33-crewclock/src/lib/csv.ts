/**
 * A minimal RFC 4180 CSV writer.
 *
 * Hand-rolled on purpose: payroll import files are pinned by golden-file tests,
 * and the exact quoting and line ending are part of the contract. A library
 * upgrade that changed either would break a customer's payroll import, which is
 * the one failure this product cannot have (README Key Risk 6).
 *
 * Rules: CRLF line endings (what ADP's and Gusto's templates carry), quote a
 * field only when it contains a comma, a double quote, a CR/LF, or leading or
 * trailing whitespace, and escape a quote by doubling it.
 */

export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  const needsQuotes = /[",\r\n]/.test(s) || s !== s.trim();
  if (!needsQuotes) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function csvRow(values: readonly (string | number | null | undefined)[]): string {
  return values.map(csvField).join(",");
}

/** Header row plus data rows, CRLF-terminated including the final line. */
export type CsvValue = string | number | null | undefined;

export function csvDocument(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CsvValue>>,
): string {
  return [csvRow(header), ...rows.map(csvRow)].map((line) => `${line}\r\n`).join("");
}
