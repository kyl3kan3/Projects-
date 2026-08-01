/**
 * Money. Integer cents, everywhere, no exceptions.
 *
 * The only places a fraction of a cent can appear are percentage discounts and
 * installment splits, so both rounding decisions live here and are named:
 *
 *  - `roundHalfUp` for anything a family owes. Half-up is what a person with a
 *    calculator does, and it is what a parent expects when they check the
 *    arithmetic on the fee summary. Banker's rounding would be defensible and
 *    surprising.
 *  - `splitCents` for installment plans, so N payments always sum back to the
 *    balance exactly — the remainder lands on the earliest payments rather than
 *    leaving a one-cent tail nobody can pay.
 */

/** Round to an integer, .5 away from zero. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** `amountCents * numerator / denominator`, rounded half-up, in one place. */
export function proportion(amountCents: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return roundHalfUp((amountCents * numerator) / denominator);
}

/** Basis points of an amount: 1000 bps of $185.00 is $18.50. */
export function basisPoints(amountCents: number, bps: number): number {
  return proportion(amountCents, bps, 10_000);
}

/**
 * Split a balance into `parts` payments that sum to exactly the balance.
 * Extra cents go to the earliest payments: $100.00 in 3 → 3334, 3333, 3333.
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

/** "$185.00" — always two decimals, never a bare "$185". */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${rest}`;
}

/**
 * Parse what a registrar types into an amount box: "180", "$180.00", "1,180.5".
 * Returns null for anything that is not a plain positive amount — silently
 * coercing a typo into a number is how a season's books go wrong.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}
