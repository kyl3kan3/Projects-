/**
 * Formatting. Pure, no imports that reach the database — client components
 * import this freely.
 *
 * Money is integer cents everywhere in the domain; this module is the only
 * place a value becomes a string with a currency symbol.
 */

/** `2400` -> `"$24.00"`. Negative values keep the sign outside the symbol. */
export function money(cents: number, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
  const body = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return symbol ? `${sign}${symbol}${body}` : `${sign}${body} ${currency}`;
}

/** For inputs: `2400` -> `"24.00"`. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

/**
 * Parse a user-typed or CSV price into cents. Tolerates currency symbols,
 * thousands separators, whitespace, and accounting negatives — `(1,234.50)`.
 * Returns null when there is no number at all, so callers can say so rather
 * than silently storing 0.
 */
export function parseMoneyToCents(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw * 100) : null;

  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  // Strip everything that is not a digit, a dot, or a comma.
  s = s.replace(/[^\d.,]/g, "");
  if (!s) return null;

  // Decide which separator is decimal. European "1.234,50" vs US "1,234.50".
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized =
      lastComma > lastDot
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // A single comma with exactly two trailing digits is a decimal comma.
    normalized = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  } else {
    normalized = s;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) * (negative ? -1 : 1);
}

/** Tolerant integer quantity parse. `"1,204"` -> 1204, `"12.0"` -> 12. */
export function parseQty(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.round(raw) : null;
  const s = raw.replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const value = Number(s);
  return Number.isFinite(value) ? Math.round(value) : null;
}

/** `"7:42pm"` — the 86 board's timestamp voice, in the location's timezone. */
export function serviceTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  })
    .format(at)
    .replace(" AM", "am")
    .replace(" PM", "pm")
    .replace(/ /g, "");
}

/** `"Mar 14"` */
export function shortDate(at: Date, timeZone = "UTC"): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(at);
}

/** `"Mar 14, 7:42pm"` — change-history rows. */
export function stamp(at: Date, timeZone = "UTC"): string {
  return `${shortDate(at, timeZone)}, ${serviceTime(at, timeZone)}`;
}

/** `"41s"`, `"2m 10s"` — enhancement durations. */
export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** `"4 items"` / `"1 item"` */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Basis points to a display percentage: `412` -> `"4.1%"`. */
export function bpToPercent(bp: number, digits = 1): string {
  return `${(bp / 100).toFixed(digits)}%`;
}
