/**
 * Money.
 *
 * Internally everything is an integer number of **micro-dollars** (1e-6 USD).
 * AWS line items are routinely sub-cent — one hour of a 20GB gp3 volume is
 * $0.00219 — so cents cannot represent the input and floats accumulate error
 * across a month of hourly rows. Rounding happens once, here, when a figure is
 * turned into text.
 *
 * Pure module: no imports, safe in a client component.
 */

export const MICROS_PER_DOLLAR = 1_000_000;

/** Parse a decimal dollar string/number from an API into micro-dollars. */
export function dollarsToMicros(amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * MICROS_PER_DOLLAR);
}

export function microsToDollars(micros: number): number {
  return micros / MICROS_PER_DOLLAR;
}

/** Round micro-dollars to whole cents — the single rounding point. */
export function microsToCents(micros: number): number {
  return Math.round(micros / 10_000);
}

/** `$12,483.07` — the money specimen from DESIGN.md. */
export function formatUsd(micros: number): string {
  const cents = microsToCents(micros);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${groupThousands(whole)}.${frac}`;
}

/** `$19,940` — no cents, for forecasts and budget limits. */
export function formatUsdWhole(micros: number): string {
  const dollars = Math.round(micros / MICROS_PER_DOLLAR);
  const sign = dollars < 0 ? "-" : "";
  return `${sign}$${groupThousands(Math.abs(dollars))}`;
}

/**
 * `+$342/DAY` — the anomaly delta specimen. Always signed, never fractional:
 * a per-day rate accurate to the cent is false precision.
 */
export function formatPerDay(micros: number): string {
  const dollars = Math.round(micros / MICROS_PER_DOLLAR);
  const sign = dollars > 0 ? "+" : dollars < 0 ? "-" : "";
  return `${sign}$${groupThousands(Math.abs(dollars))}/DAY`;
}

/** `$611/MO` — waste rows and budget captions. */
export function formatPerMonth(micros: number): string {
  return `${formatUsdWhole(micros)}/MO`;
}

/** `+8%` / `−3%` / `flat`. Percent of a baseline, rounded to a whole point. */
export function formatPercentDelta(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "new" : "flat";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "flat";
  return `${pct > 0 ? "+" : "-"}${Math.abs(pct)}%`;
}

function groupThousands(n: number): string {
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return out;
}

/** Sum a `sum()` result that postgres.js hands back as a string or null. */
export function sumToMicros(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
