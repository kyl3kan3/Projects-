/**
 * Money. Integer cents, everywhere, no exceptions.
 *
 * The only place a fraction of a cent can appear is proration and percentage
 * late fees, so both rounding decisions live here and are named:
 *
 *  - `roundHalfUp` for amounts a member owes. Half-up is what a treasurer does
 *    with a calculator, and it is what a member expects when they check the
 *    arithmetic by hand. Banker's rounding would be defensible and surprising.
 *  - `splitCents` for payment plans, so N instalments always sum back to the
 *    balance exactly — the remainder lands on the earliest instalments rather
 *    than leaving a one-cent tail nobody can pay.
 */

/** Round to an integer, .5 away from zero. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * `amountCents * numerator / denominator`, rounded half-up.
 * Kept as one function so no caller reinvents the rounding.
 */
export function proportion(amountCents: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return roundHalfUp((amountCents * numerator) / denominator);
}

/** Basis points of an amount: 150 bps of $100.00 is $1.50. */
export function basisPoints(amountCents: number, bps: number): number {
  return proportion(amountCents, bps, 10_000);
}

/**
 * Split a balance into `parts` instalments that sum to exactly the balance.
 * Extra cents go to the earliest instalments: $100.00 in 3 → 3334, 3333, 3333.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  let remainder = totalCents - base * parts;
  const out: number[] = [];
  for (let i = 0; i < parts; i++) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    out.push(base + extra);
  }
  return out;
}

/** "$1,340.00" — always two decimals, never a bare "$1,340". */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}.${rest}`;
}

/** "$11,340" for hero stats where cents are rendered at 60% size separately. */
export function splitMoney(cents: number): { whole: string; cents: string; negative: boolean } {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return {
    whole: `$${Math.floor(abs / 100).toLocaleString("en-US")}`,
    cents: String(abs % 100).padStart(2, "0"),
    negative,
  };
}

/**
 * Parse what a treasurer types into a payment box: "180", "$180.00", "1,180.5".
 * Returns null for anything that isn't a plain positive amount — silently
 * coercing a typo into a number is how ledgers go wrong.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
