/**
 * Fixed-point arithmetic. Read this before touching anything that adds up money.
 *
 * ## The decision
 *
 * There is no IEEE-754 float anywhere in TradeLog's money path. Not one. A
 * journal that reports `0.30000000000000004` for three dimes has destroyed the
 * only thing it sells, and float error in a P&L sum is not a rounding
 * curiosity — it compounds across every fill of every trade.
 *
 * Everything is a `bigint` at a fixed decimal scale:
 *
 * | Type    | Scale        | Holds                                            |
 * |---------|--------------|--------------------------------------------------|
 * | `Qty`   | 1e-8 units   | 200 shares, 3 contracts, 0.05123 BTC             |
 * | `Price` | 1e-8 dollars | 241.15, 4.325, 0.00001234                        |
 * | `Mult`  | 1e-3 ×       | 1 (equity), 100 (option), 50 (ES), 0.5 (MYM)     |
 * | `Money` | 1e-19 dollars| every intermediate money value                   |
 * | `Cents` | 1 cent       | every *stored* and *displayed* money value       |
 *
 * `Money`'s scale is not arbitrary: `Qty × Price × Mult` lands on 1e-19
 * exactly, so a fill's notional is an exact product with no division and
 * therefore no rounding. (The multiplier carries three decimals because the
 * Micro E-mini Dow really is $0.50 a point — rounding it to an integer would
 * double every MYM trade.) Sums of exact values are exact. **Rounding happens
 * once**, at the boundary where a trade's realised P&L is persisted
 * (`moneyToCents`), never per fill. Round-per-fill was the alternative and it
 * drifts: 900 fills of a half-cent regulatory fee is $4.50 that either exists
 * or doesn't.
 *
 * Why cents (and not `Money`) for storage: a cent is the unit a brokerage
 * statement is denominated in, so it is the unit a trader can reconcile
 * against. `bigint` cents in Postgres survives $90 trillion; the numbers a
 * retail trader brings will not trouble it.
 *
 * The two lossy conversions in the system are both unavoidable divisions and
 * both are explicit: `moneyToCents` (round half away from zero) and
 * `weightedAvgPrice` (round half away from zero at 8dp). Nothing else divides.
 */

/** Quantity, scaled by 1e8. 8dp covers crypto; equities/futures are integers. */
export type Qty = bigint;
/** Price per unit, scaled by 1e8. */
export type Price = bigint;
/** Any intermediate money value, scaled by 1e19. Exact under + - and × by an integer. */
export type Money = bigint;
/** Whole cents. The storage and display unit. */
export type Cents = bigint;
/** Contract multiplier in thousandths: 1000 = ×1, 100_000 = ×100, 500 = ×0.5. */
export type Mult = number;

export const QTY_SCALE = 100_000_000n; // 1e8
export const PRICE_SCALE = 100_000_000n; // 1e8
export const MULT_SCALE = 1_000; // 1e3, a plain number: it is an exact small integer
export const MONEY_SCALE = 10_000_000_000_000_000_000n; // 1e19
export const MONEY_PER_CENT = 100_000_000_000_000_000n; // 1e17

export const QTY_DP = 8;
export const PRICE_DP = 8;
export const MONEY_DP = 19;

export class DecimalParseError extends Error {
  constructor(readonly input: string) {
    super(`Not a number: ${JSON.stringify(input)}`);
    this.name = "DecimalParseError";
  }
}

/* ------------------------------------------------------------- primitives --- */

/** Integer division rounding half away from zero (what a statement does). */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("divRound: division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

export function absBig(v: bigint): bigint {
  return v < 0n ? -v : v;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

const POW10: bigint[] = Array.from({ length: 33 }, (_, i) => 10n ** BigInt(i));

function pow10(n: number): bigint {
  return POW10[n] ?? 10n ** BigInt(n);
}

/**
 * Parse a decimal string into a scaled bigint. Broker CSVs are written by
 * spreadsheets and humans, so this accepts what they actually emit:
 * `1,234.56`, `$1,234.56`, `(12.00)` for negative, `+200`, `-3`, `2.5e-4`,
 * a bare `.5`, and surrounding whitespace or quotes. Digits beyond the target
 * scale round half away from zero.
 *
 * It does NOT silently accept garbage: an empty string, `N/A`, or `12.3.4`
 * throws, because a parser that reads a broken cell as zero is how a journal
 * quietly loses a $4,000 trade.
 */
export function parseDecimal(input: string, decimals: number): bigint {
  let s = String(input).trim().replace(/^["']|["']$/g, "").trim();
  if (!s) throw new DecimalParseError(input);

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/[$\s]/g, "");
  // Thousands separators are only stripped when they are actually grouping
  // digits — "1,2," is a broken cell, not the number 12.
  if (s.includes(",")) {
    if (!/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) throw new DecimalParseError(input);
    s = s.replace(/,/g, "");
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!s) throw new DecimalParseError(input);

  // Scientific notation: fold the exponent into the requested scale.
  let exponent = 0;
  const eIndex = s.search(/[eE]/);
  if (eIndex >= 0) {
    const exp = s.slice(eIndex + 1);
    if (!/^[+-]?\d+$/.test(exp)) throw new DecimalParseError(input);
    exponent = Number(exp);
    if (!Number.isFinite(exponent) || Math.abs(exponent) > 24) throw new DecimalParseError(input);
    s = s.slice(0, eIndex);
  }

  if (!/^\d*\.?\d*$/.test(s) || !/\d/.test(s)) throw new DecimalParseError(input);
  const [whole = "", fraction = ""] = s.split(".");

  // Shift the digit string by the exponent, then to the target scale.
  let digits = `${whole}${fraction}`;
  let scale = fraction.length - exponent; // value = digits / 10^scale
  if (scale < 0) {
    digits += "0".repeat(-scale);
    scale = 0;
  }
  let value = BigInt(digits);
  if (scale <= decimals) {
    value *= pow10(decimals - scale);
  } else {
    value = divRound(value, pow10(scale - decimals));
  }
  return negative ? -value : value;
}

/** Render a scaled bigint as a plain decimal string, e.g. 24115000000n@8 -> "241.15". */
export function formatScaled(
  value: bigint,
  decimals: number,
  opts: { minDecimals?: number; group?: boolean } = {},
): string {
  const minDecimals = opts.minDecimals ?? 0;
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals) || "0";
  let fraction = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  fraction = fraction.replace(/0+$/, "");
  while (fraction.length < minDecimals) fraction += "0";
  const grouped = opts.group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : whole;
  return `${negative ? "-" : ""}${grouped}${fraction ? `.${fraction}` : ""}`;
}

/* ------------------------------------------------------------ constructors --- */

export const parseQty = (s: string): Qty => parseDecimal(s, QTY_DP);
export const parsePrice = (s: string): Price => parseDecimal(s, PRICE_DP);
/** Parse a dollar amount (fees, cash adjustments) into exact `Money`. */
export const parseMoney = (s: string): Money => parseDecimal(s, MONEY_DP);

export const qty = (units: number | string): Qty => parseQty(String(units));
export const price = (dollars: number | string): Price => parsePrice(String(dollars));
export const money = (dollars: number | string): Money => parseMoney(String(dollars));
export const cents = (whole: number | string): Cents => BigInt(parseDecimal(String(whole), 0));

/* -------------------------------------------------------------- conversion --- */

/** The one rounding step in the P&L path. Half away from zero. */
export const moneyToCents = (m: Money): Cents => divRound(m, MONEY_PER_CENT);
export const centsToMoney = (c: Cents): Money => c * MONEY_PER_CENT;

/**
 * A fill's notional value: qty × price × contract multiplier. Exact — the
 * scales were chosen so this product needs no division.
 *
 * `multiplierMilli` is in thousandths (see `Mult`). Passing 100 instead of
 * 100_000 for an option would understate the trade by 1000×, so the type alias
 * and this note are the only guardrail; `multiplierFor()` in instruments.ts is
 * the only sanctioned source of the value.
 */
export function notional(q: Qty, p: Price, multiplierMilli: Mult): Money {
  return q * p * BigInt(multiplierMilli);
}

/**
 * Volume-weighted average price over a set of fills, rounded to 8dp.
 * Returns 0n for an empty set (callers treat 0 qty as "no position").
 */
export function weightedAvgPrice(fills: readonly { qty: Qty; price: Price }[]): Price {
  let totalQty = 0n;
  let totalValue = 0n; // Money scale
  for (const f of fills) {
    totalQty += f.qty;
    totalValue += f.qty * f.price;
  }
  if (totalQty === 0n) return 0n;
  return divRound(totalValue, totalQty);
}

/** Cents as a JS number of dollars — for chart geometry only, never for sums. */
export const centsToDollarsNumber = (c: Cents): number => Number(c) / 100;
export const qtyToNumber = (q: Qty): number => Number(q) / Number(QTY_SCALE);
export const priceToNumber = (p: Price): number => Number(p) / Number(PRICE_SCALE);

/* ------------------------------------------------------------- formatting --- */

const MINUS = "−"; // DESIGN.md sets negatives with a real minus sign.

export interface MoneyFormat {
  /** Always show a sign, so `+$412` reads as a gain at a glance. */
  signed?: boolean;
  /** Drop the cents on figures over $1,000 (dashboard stat numerals). */
  compact?: boolean;
  /** Use "-" instead of U+2212 (for aria-labels, exports, tests). */
  ascii?: boolean;
}

/** "$1,234.56" · "−$1,234.56" · "+$38.00". */
export function formatCents(value: Cents, opts: MoneyFormat = {}): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const body =
    opts.compact && magnitude >= 100_000n
      ? formatScaled(divRound(magnitude, 100n), 0, { group: true })
      : formatScaled(magnitude, 2, { minDecimals: 2, group: true });
  const minus = opts.ascii ? "-" : MINUS;
  const sign = negative ? minus : opts.signed ? "+" : "";
  return `${sign}$${body}`;
}

/** "241.15" · "0.00001234" — prices keep every significant digit they arrived with. */
export function formatPrice(value: Price, minDecimals = 2): string {
  return formatScaled(value, PRICE_DP, { minDecimals, group: true });
}

/** "200" · "0.05123" — trailing zeros trimmed, integers stay integers. */
export function formatQty(value: Qty): string {
  return formatScaled(value, QTY_DP, { group: true });
}

/**
 * R-multiples are stored scaled by 1e4 and displayed to two decimals:
 * "+2.30R" · "−1.00R". The stored precision is kept because it feeds averages;
 * the display is rounded because "+2.4996R" is four digits of noise about a
 * number whose denominator the trader typed from memory.
 */
export const R_SCALE = 10_000n;

export function formatR(value: bigint | null, decimals = 2): string {
  if (value === null) return "—";
  const rounded = divRound(value, 10n ** BigInt(4 - decimals));
  const negative = rounded < 0n;
  const body = formatScaled(negative ? -rounded : rounded, decimals, { minDecimals: decimals });
  return `${negative ? MINUS : "+"}${body}R`;
}

/**
 * "1.62" · "—" when there is no denominator. Ratios (profit factor and the
 * like) arrive scaled by 1e4 and are rounded down to the displayed precision,
 * not truncated. Ratios are never money-coloured — see DESIGN.md's P/L rules.
 */
export function formatRatio(value: bigint | null, decimals = 2): string {
  if (value === null) return "—";
  const rounded = divRound(value, 10n ** BigInt(4 - decimals));
  return formatScaled(rounded, decimals, { minDecimals: decimals });
}

/**
 * "54%" — percentages arrive scaled by 1e2 and are shown to whole percent by
 * default, which is DESIGN.md's specimen and the only precision a win rate over a
 * few hundred trades can honestly carry.
 */
export function formatPercent(hundredths: bigint | null, decimals = 0): string {
  if (hundredths === null) return "—";
  const rounded = divRound(hundredths, 10n ** BigInt(2 - decimals));
  return `${formatScaled(rounded, decimals, { minDecimals: decimals })}%`;
}
