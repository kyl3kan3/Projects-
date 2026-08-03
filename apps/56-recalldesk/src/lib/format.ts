/**
 * src/lib/format.ts
 *
 * Presentation helpers. Pure and dependency-free so client components can import
 * them without dragging the database client into the browser bundle.
 *
 * Money is integer cents everywhere in RecallDesk and is formatted exactly once,
 * here, at the edge. There is no floating-point dollar value anywhere in the
 * codebase — a recovered-production total that is out by a cent is a number a
 * dentist stops trusting.
 */

/** 184_300_00 -> "$184,300". Whole dollars: the overdue total is never cents. */
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}

/** 31_050 -> "$310.50". Used where the exact figure matters (a receipt row). */
export function moneyExact(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** "Rosalind" + "Mbeki" -> "R.M." — initials for a week-strip cell. */
export function initials(firstName: string, lastName: string): string {
  const f = firstName.trim()[0] ?? "";
  const l = lastName.trim()[0] ?? "";
  return `${f}${l}`.toUpperCase();
}

/**
 * A patient's name as it appears in staff-facing lists: full name. The booking
 * page and outbound copy use the first name only, and nothing outside the app
 * ever carries a full name in a subject line (PHI discipline).
 */
export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

/** "+15125550147" / "5125550147" -> "(512) 555-0147". Unknown shapes pass through. */
export function phoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** tel: href for the call queue's tap-to-dial. */
export function phoneHref(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

/** Mask an email for a screen a patient might see over a shoulder. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, 1);
  return `${head}${"•".repeat(Math.max(2, user.length - 1))}@${domain}`;
}

export function pluralize(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

/** "3 days ago" / "today" — for last-touch lines. */
export function relativeDays(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} ${pluralize(months, "month")} ago`;
  const years = Math.floor(months / 12);
  return `${years} ${pluralize(years, "year")} ago`;
}
