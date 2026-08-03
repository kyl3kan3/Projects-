/**
 * src/lib/format.ts
 *
 * Presentation helpers. Pure and dependency-free, so a client component can import
 * them without dragging the database client into the browser bundle.
 *
 * Money is integer cents everywhere in ChairFlow and becomes a string exactly once,
 * here, at the edge. There is no floating-point dollar value anywhere in the
 * codebase: a fee receipt that is out by a cent is a receipt a stylist cannot use
 * in a dispute.
 */

/** 2250 -> "$22.50". The ledger line's form: always exact, always two places. */
export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** 4500 -> "$45". Service prices, which stylists set in whole dollars. */
export function moneyShort(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  if (abs % 100 !== 0) return money(cents);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}`;
}

/** A signed amount for a ledger row: "+$22.50" / "-$10.00". */
export function moneySigned(cents: number): string {
  return `${cents >= 0 ? "+" : ""}${money(cents)}`;
}

/** Split for the hero stat, whose cents render at 60% size (DESIGN.md). */
export function moneyParts(cents: number): { whole: string; fraction: string } {
  const abs = Math.abs(Math.round(cents));
  return {
    whole: `${cents < 0 ? "-" : ""}$${Math.floor(abs / 100).toLocaleString("en-US")}`,
    fraction: `.${String(abs % 100).padStart(2, "0")}`,
  };
}

/** "45 min" / "1h 15m" — service durations. */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "+15125550147" -> "(512) 555-0147". Unknown shapes pass through unchanged. */
export function phoneDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/**
 * Anything a person typed into a phone field -> E.164, or null.
 *
 * The client's phone number is their identity in a stylist's book (the unique index
 * is `(stylist_id, phone)`), so "512-555-0147" and "(512) 555 0147" must land on the
 * same row or the same person accumulates two histories and two cadences.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // Already international, or long enough to plausibly be one.
  if (raw.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

export function phoneHref(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits.length === 10 ? `1${digits}` : digits}`;
}

export function fullName(c: { firstName: string; lastName: string | null }): string {
  return `${c.firstName} ${c.lastName ?? ""}`.trim();
}

export function initials(c: { firstName: string; lastName: string | null }): string {
  const a = c.firstName.trim()[0] ?? "";
  const b = (c.lastName ?? "").trim()[0] ?? "";
  return `${a}${b}`.toUpperCase();
}

export function pluralize(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}

/** "3 fees · 2 deposits kept · 1 waived" — joins only the non-zero parts. */
export function joinParts(parts: Array<string | null>): string {
  return parts.filter((p): p is string => Boolean(p)).join(" · ");
}

/** A handle a stylist typed -> the slug that can be in a URL, or null. */
export function normalizeHandle(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length < 3 || slug.length > 30) return null;
  return slug;
}
