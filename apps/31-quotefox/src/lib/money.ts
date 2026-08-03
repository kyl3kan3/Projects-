/**
 * Money and quantities. Integer cents, integer thousandths, no floats.
 *
 * The estimate is the product, so its arithmetic is the part that must not be
 * approximately right. Three rules hold everywhere:
 *
 *  - **Cents in, cents out.** Dollars only exist in `format*` and in the parser
 *    at the edge (CSV import, a typed price field), which rounds once.
 *  - **Quantities are thousandths.** 2.5 hours is 2500. A line total is
 *    `quantityMilli × unitPriceCents / 1000`, rounded once at the end.
 *  - **Markup is applied to cost, then rounded**, so a price shown to a
 *    homeowner is the price that gets multiplied — never a rounded product of
 *    rounded factors.
 */

/** Round to whole units, halves away from zero, with an epsilon nudge so that
 *  binary noise like 14.499999999999998 (really 14.5) does not round down. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const nudged = abs + Math.max(abs, 1) * Number.EPSILON * 4;
  return sign * Math.floor(nudged + 0.5);
}

/**
 * Parse a human or CSV amount ("1,200.50", "$4,800", "68", "(120.00)") into
 * cents. Returns null for anything that is not a number — a silent zero in a
 * price book is a quote that loses money.
 */
export function parseAmountToCents(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? roundHalfUp(input * 100) : null;
  }
  let text = String(input ?? "").trim();
  if (!text) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  const cleaned = text.replace(/[\s,]/g, "").replace(/^[^\d.\-+]+/, "");
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return sign * roundHalfUp(value * 100);
}

/** Parse a quantity ("2", "2.5", "1 1/2", "32") into thousandths. */
export function parseQuantityToMilli(input: string | number | null | undefined): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? roundHalfUp(input * 1000) : null;
  }
  const text = String(input ?? "").trim();
  if (!text) return null;
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (!den) return null;
    return roundHalfUp((whole + num / den) * 1000);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(text);
  if (fraction) {
    const den = Number(fraction[2]);
    if (!den) return null;
    return roundHalfUp((Number(fraction[1]) / den) * 1000);
  }
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  return roundHalfUp(Number(cleaned) * 1000);
}

/** Cost → customer price, using whole-percent markup. Rounded once. */
export function applyMarkup(unitCostCents: number, markupPct: number): number {
  const cost = Math.max(0, Math.round(unitCostCents) || 0);
  const pct = Number.isFinite(markupPct) ? markupPct : 0;
  return roundHalfUp(cost * (1 + pct / 100));
}

/** quantityMilli × unitPriceCents, rounded once at the end. */
export function lineTotalCents(quantityMilli: number, unitPriceCents: number): number {
  const qty = Math.max(0, Math.round(quantityMilli) || 0);
  const unit = Math.round(unitPriceCents) || 0;
  return roundHalfUp((qty * unit) / 1000);
}

export interface EstimateTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  /** Rows the AI could not price. They carry no money and block sending. */
  needsPricingCount: number;
}

export interface TotalableLine {
  lineTotalCents: number;
  needsPricing: boolean;
  /** Labour is not taxed in most states; material is. Kept simple: taxable flag. */
  taxable?: boolean;
}

/**
 * Totals for an estimate. Unpriced rows contribute nothing — showing a total that
 * silently excludes a flagged row *and* calling the estimate ready to send is how
 * a contractor eats a crane rental, so `needsPricingCount` travels with the total
 * and the send path refuses while it is non-zero.
 */
export function computeTotals(lines: readonly TotalableLine[], taxRateBp: number): EstimateTotals {
  let subtotal = 0;
  let taxable = 0;
  let needsPricingCount = 0;
  for (const line of lines) {
    if (line.needsPricing) {
      needsPricingCount += 1;
      continue;
    }
    const amount = Math.round(line.lineTotalCents) || 0;
    subtotal += amount;
    if (line.taxable !== false) taxable += amount;
  }
  const bp = Math.max(0, Math.round(taxRateBp) || 0);
  const taxCents = roundHalfUp((taxable * bp) / 10_000);
  return { subtotalCents: subtotal, taxCents, totalCents: subtotal + taxCents, needsPricingCount };
}

/* ------------------------------------------------------------ formatting --- */

/** "$3,120.00" — the canonical money string. */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}

/** "$18,640" — hero figures drop a zero-cents tail but keep a real one. */
export function formatMoneyShort(cents: number, currency = "USD"): string {
  const value = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** "2", "2.5", "32" — trailing zeros trimmed, never scientific notation. */
export function formatQuantity(quantityMilli: number): string {
  const value = (Math.round(quantityMilli) || 0) / 1000;
  return String(Number(value.toFixed(3)));
}
