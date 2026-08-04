/**
 * src/lib/money.ts
 *
 * Every amount in RigRent is an integer number of cents. Nothing in this module
 * produces a float another function might round a second time: cents in, cents
 * out, and rounding happens exactly once at the place that documents it.
 */

/** `184500` → `"$1,845.00"`. Display only — never feed this back into arithmetic. */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${rest}`;
}

/** `184500` → `"$1,845"` when whole, `"$1,845.50"` otherwise. For dense rows. */
export function formatMoneyShort(cents: number): string {
  return cents % 100 === 0
    ? `${cents < 0 ? "-" : ""}$${Math.abs(Math.trunc(cents / 100)).toLocaleString("en-US")}`
    : formatMoney(cents);
}

/**
 * Parse a staff-typed amount into cents. Accepts `"185"`, `"1,850"`, `"$185.50"`.
 * Rejects anything else rather than guessing — a mistyped rate becomes a wrong
 * price on every quote until somebody notices.
 */
export function parseMoneyToCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Enter an amount like 185 or 185.00 (got "${input}")`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const value = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -value : value;
}

/** Basis points of an amount, rounded half-up exactly once. `2500 bps` = 25%. */
export function applyBps(cents: number, bps: number): number {
  return Math.round((cents * bps) / 10_000);
}

/** `250` → `"2.5%"`. */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}

/** Parse `"8.25"` or `"8.25%"` into basis points. */
export function parsePercentToBps(input: string): number {
  const cleaned = input.trim().replace(/[%\s]/g, "");
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) {
    throw new Error(`Enter a percentage like 8.25 (got "${input}")`);
  }
  return Math.round(Number(cleaned) * 100);
}

/** Whole positive integer from a form field, or throw with the field's name. */
export function parseCount(input: string, label: string): number {
  const cleaned = input.trim();
  if (!/^\d+$/.test(cleaned)) throw new Error(`${label} must be a whole number (got "${input}")`);
  return Number(cleaned);
}
