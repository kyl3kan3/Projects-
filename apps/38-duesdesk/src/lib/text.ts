/**
 * Small pure string helpers shared by the notification, roster, and UI layers.
 * Deliberately free of database and Next imports so they can be unit-tested on
 * their own.
 */

/** US-centric E.164 normalisation: what a roster spreadsheet actually contains. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

/** Display form for a stored E.164 number: "+16145550142" → "(614) 555-0142". */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "—";
  const m = value.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : value;
}

/**
 * Merge tags shared by reminders, invoices, notices, and announcements.
 * An unknown tag renders empty — printing "{{nmae}}" at a member is worse than
 * printing nothing.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One CSV field, quoted only when it has to be. */
export function csvField(value: string | null | undefined): string {
  const s = value ?? "";
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** First name for a greeting, falling back to whatever we have. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
