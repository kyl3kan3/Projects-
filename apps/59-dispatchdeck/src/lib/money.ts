/**
 * src/lib/money.ts
 *
 * Money is integer cents and gallons are integer thousandths. Nothing in this
 * app multiplies a float by a rate: rounding happens once, here, at the edge
 * where a human types a figure in or reads one back.
 *
 * Pure — safe to import from a client component.
 */

/** "1,850.00" / "$1,850.00" from cents. Always two decimals, always grouped. */
export function formatCents(cents: number, opts: { sign?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-US");
  const body = `$${grouped}.${rest}`;
  if (negative) return `-${body}`;
  return opts.sign && cents > 0 ? `+${body}` : body;
}

/** Cents with no currency mark — for CSV columns the factor parses. */
export function centsToDecimal(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  return `${negative ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Parse a typed dollar figure into cents. Accepts "1850", "1,850", "$1,850.5",
 * "1850.00". Returns null for anything it cannot read — the caller shows a
 * sentence rather than storing a zero.
 */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  if (cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole || "0") * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

export const GALLON_SCALE = 1000;

/** "112.482" → 112482 thousandths. Null when unreadable. */
export function parseGallonsToMilli(input: string): number | null {
  const cleaned = input.trim().replace(/[,\s]/g, "");
  if (cleaned === "" || !/^\d*(\.\d{0,3})?$/.test(cleaned) || cleaned === ".") return null;
  const [whole, frac = ""] = cleaned.split(".");
  const milli = Number(whole || "0") * GALLON_SCALE + Number(frac.padEnd(3, "0"));
  return Number.isFinite(milli) ? milli : null;
}

/** 112482 → "112.48" (two decimals is how a fuel receipt prints). */
export function formatGallons(milli: number, decimals = 2): string {
  return (milli / GALLON_SCALE).toFixed(decimals);
}

/**
 * Miles per gallon from integer inputs, rounded to two decimals. Zero gallons
 * returns null — an MPG of Infinity on a settlement sheet is a lie.
 */
export function mpg(miles: number, gallonsMilli: number): number | null {
  if (gallonsMilli <= 0) return null;
  return Math.round((miles / (gallonsMilli / GALLON_SCALE)) * 100) / 100;
}

/** Cents per mile, rounded to the cent. Null when there are no miles. */
export function centsPerMile(cents: number, miles: number): number | null {
  if (miles <= 0) return null;
  return Math.round(cents / miles);
}

/** "$2.14" from 214 cents-per-mile. */
export function formatPerMile(cpm: number | null): string {
  return cpm === null ? "—" : formatCents(cpm);
}

/** Basis points of an amount, rounded half-up once. 9700 bps of 100000 = 97000. */
export function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}
