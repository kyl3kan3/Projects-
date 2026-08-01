/**
 * Money. Every amount in PaperTrail is an integer number of minor units in an
 * explicit currency — never a float, never a formatted string.
 *
 * The rules this file exists to guarantee:
 *
 *  - Rounding is half-away-from-zero, once, at the point a number becomes an
 *    amount. A line total is rounded before it is summed, so what a client sees
 *    on the sheet is exactly what the sum is made of.
 *  - `deposit + balance === total`, always. The deposit is rounded and the
 *    balance is the remainder — never both rounded, which is how a cent goes
 *    missing between two invoices.
 *  - Zero-decimal currencies (JPY) are real: 1200 minor units is ¥1,200, not
 *    ¥12.00.
 */

import type { LineItem } from "@/db/schema";

/* -------------------------------------------------------------- currency --- */

export interface Currency {
  code: string;
  /** Decimal places: 2 for USD, 0 for JPY. */
  exponent: number;
  name: string;
}

export const CURRENCIES: Record<string, Currency> = {
  USD: { code: "USD", exponent: 2, name: "US dollar" },
  EUR: { code: "EUR", exponent: 2, name: "Euro" },
  GBP: { code: "GBP", exponent: 2, name: "Pound sterling" },
  CAD: { code: "CAD", exponent: 2, name: "Canadian dollar" },
  AUD: { code: "AUD", exponent: 2, name: "Australian dollar" },
  JPY: { code: "JPY", exponent: 0, name: "Japanese yen" },
};

export const DEFAULT_CURRENCY = "USD";

export function currency(code: string): Currency {
  return CURRENCIES[code?.toUpperCase?.() ?? ""] ?? CURRENCIES[DEFAULT_CURRENCY];
}

/** 100 for two-decimal currencies, 1 for yen. */
export function minorFactor(code: string): number {
  return 10 ** currency(code).exponent;
}

/* -------------------------------------------------------------- rounding --- */

/**
 * Round to an integer, halves away from zero (what an accountant means by
 * "round half up"), with a relative epsilon so binary-float noise like
 * 14.499999999999998 — which is really 14.5 — doesn't round down.
 */
export function roundMinor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const nudged = abs + Math.max(abs, 1) * Number.EPSILON * 4;
  return sign * Math.floor(nudged + 0.5);
}

/* ------------------------------------------------------------ line items --- */

/** A line total: quantity (up to 3dp) × unit price, rounded to minor units. */
export function lineTotal(line: Pick<LineItem, "quantity" | "unitAmount">): number {
  // Scale the quantity to an integer first: 0.1 × 3 in binary floats is not 0.3,
  // and an hourly rate multiplied by 7.35 hours must not drift.
  const q = Math.round((Number(line.quantity) || 0) * 1000);
  const unit = Math.round(Number(line.unitAmount) || 0);
  return roundMinor((q * unit) / 1000);
}

/** The rows that count: every required row, plus the add-ons the client took. */
export function billableLines(lines: readonly LineItem[]): LineItem[] {
  return lines.filter((l) => !l.optional || l.selected);
}

export interface Totals {
  subtotal: number;
  /** The part of the subtotal that tax applies to. */
  taxableBase: number;
  tax: number;
  total: number;
}

/**
 * Totals for a pricing table. `taxRateBps` is basis points: 8.875% → 888.
 * Tax is computed on the taxable subtotal and rounded once.
 */
export function computeTotals(lines: readonly LineItem[], taxRateBps = 0): Totals {
  let subtotal = 0;
  let taxableBase = 0;
  for (const line of billableLines(lines)) {
    const amount = lineTotal(line);
    subtotal += amount;
    if (line.taxable) taxableBase += amount;
  }
  const tax = roundMinor((taxableBase * (Math.round(taxRateBps) || 0)) / 10_000);
  return { subtotal, taxableBase, tax, total: subtotal + tax };
}

/* --------------------------------------------------------------- deposit --- */

export interface DepositSplit {
  deposit: number;
  balance: number;
}

/**
 * Split a signed total into the deposit billed now and the balance billed on
 * completion. The deposit is rounded; the balance is the remainder, so the two
 * invoices always add up to exactly the total.
 */
export function splitDeposit(total: number, depositPercent: number): DepositSplit {
  const pct = Math.min(100, Math.max(0, Math.round(depositPercent) || 0));
  const deposit = Math.min(total, Math.max(0, roundMinor((total * pct) / 100)));
  return { deposit, balance: total - deposit };
}

/* ------------------------------------------------------------ formatting --- */

/**
 * Format for display. Uses the currency's own decimal places, and en-US
 * conventions deliberately: the freelancer's client list is international but
 * the sheet is one document, so the number format must not shift under it.
 */
export function formatMoney(minor: number, code = DEFAULT_CURRENCY): string {
  const cur = currency(code);
  const value = (Number(minor) || 0) / minorFactor(cur.code);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur.code,
    minimumFractionDigits: cur.exponent,
    maximumFractionDigits: cur.exponent,
  }).format(value);
}

/** Compact form for stat blocks: $18,250 with no trailing ".00". */
export function formatMoneyShort(minor: number, code = DEFAULT_CURRENCY): string {
  const cur = currency(code);
  const value = (Number(minor) || 0) / minorFactor(cur.code);
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur.code,
    minimumFractionDigits: whole ? 0 : cur.exponent,
    maximumFractionDigits: cur.exponent,
  }).format(value);
}

/**
 * Parse a human amount ("1,200.50", "$4,800", "1 200") into minor units.
 * Returns null for anything that isn't a number — a silent 0 in a pricing table
 * is a bug that bills somebody the wrong amount.
 */
export function parseMoneyInput(input: string, code = DEFAULT_CURRENCY): number | null {
  const cleaned = String(input ?? "")
    .replace(/[\s, ]/g, "")
    .replace(/^[^\d.\-+]+/, "");
  if (!/^[-+]?\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return roundMinor(value * minorFactor(code));
}

/** Parse a tax percentage ("8.875") into basis points (888). */
export function parseTaxPercent(input: string): number | null {
  const cleaned = String(input ?? "").replace(/[\s%]/g, "");
  if (cleaned === "") return 0;
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return roundMinor(pct * 100);
}

/** Basis points back to a display percentage: 888 → "8.88%". */
export function formatTaxPercent(bps: number): string {
  const pct = (Number(bps) || 0) / 100;
  const text = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/0$/, "");
  return `${text}%`;
}

/** What is still owed on an invoice. Never negative — overpayment is credit. */
export function balanceDue(invoice: { total: number; amountPaid: number }): number {
  return Math.max(0, (invoice.total || 0) - (invoice.amountPaid || 0));
}
