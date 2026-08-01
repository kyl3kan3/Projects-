/**
 * CSV export. Pure string work so the row escaping can be tested — a founder's
 * list is the asset they'd be most upset to get back mangled.
 */

/**
 * RFC 4180 field escaping, plus one hardening step: a field starting with
 * `= + - @` is prefixed with a single quote. Without it a signup whose "email"
 * is `=HYPERLINK(...)` becomes a live formula the moment the founder opens the
 * file in Excel.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(fields: readonly unknown[]): string {
  return fields.map(csvField).join(",");
}

/** Build a whole document. CRLF line endings, as the spec asks. */
export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [csvRow(header), ...rows.map(csvRow)].join("\r\n") + "\r\n";
}

/** `launchlist-ledgerly-2026-08-01.csv` */
export function exportFilename(slug: string, when: Date = new Date()): string {
  return `launchlist-${slug}-${when.toISOString().slice(0, 10)}.csv`;
}

export const SIGNUP_EXPORT_HEADER = [
  "email",
  "position",
  "join_rank",
  "status",
  "referral_code",
  "referred_by_code",
  "credited_referrals",
  "boost_points",
  "source",
  "fraud_score",
  "verified_at",
  "created_at",
] as const;
