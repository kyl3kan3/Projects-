/**
 * src/lib/pricing.ts
 *
 * What a quote costs. Pure functions over cents and date strings, so the whole
 * money path is unit-testable without a database.
 *
 * The rental window is half-open: `[outOn, dueBackOn)`. Billable days is the
 * length of that window, minimum one — gear out Saturday and back Sunday is one
 * day, not two, and staff reading "Aug 8–9" as two days is how a yard
 * accidentally doubles a price.
 *
 * A **weekend rate** is the party-rental convention: one flat price covering an
 * event weekend rather than a per-day multiple. It applies when the item has one
 * and the window is short (≤ 3 days) and actually touches a Saturday or Sunday.
 * A Tuesday-to-Thursday rental of the same item pays the daily rate three times,
 * which is what the shop means by "weekend rate".
 */

import { addDays, daysBetween, isWeekendDay, type IsoDate } from "@/lib/dates";
import { applyBps } from "@/lib/money";

export const MAX_WEEKEND_WINDOW_DAYS = 3;

export interface RatedItem {
  dailyRateCents: number;
  weekendRateCents: number | null;
}

/** Billable days in the window. Minimum one; a zero-length window is not a rental. */
export function billableDays(outOn: IsoDate, dueBackOn: IsoDate): number {
  return Math.max(1, daysBetween(outOn, dueBackOn));
}

/** True when the half-open window contains a Saturday or a Sunday. */
export function touchesWeekend(outOn: IsoDate, dueBackOn: IsoDate): boolean {
  const days = billableDays(outOn, dueBackOn);
  for (let i = 0; i < days; i++) {
    if (isWeekendDay(addDays(outOn, i))) return true;
  }
  return false;
}

export interface RateBreakdown {
  /** Price for one unit across the whole window. */
  rateCents: number;
  days: number;
  basis: "daily" | "weekend";
}

/** The per-unit price of an item for one window, and why it is that price. */
export function rateForWindow(
  item: RatedItem,
  outOn: IsoDate,
  dueBackOn: IsoDate,
): RateBreakdown {
  const days = billableDays(outOn, dueBackOn);
  if (
    item.weekendRateCents !== null &&
    item.weekendRateCents > 0 &&
    days <= MAX_WEEKEND_WINDOW_DAYS &&
    touchesWeekend(outOn, dueBackOn)
  ) {
    return { rateCents: item.weekendRateCents, days, basis: "weekend" };
  }
  return { rateCents: item.dailyRateCents * days, days, basis: "daily" };
}

export interface QuoteLineInput {
  quantity: number;
  rateCents: number;
}

export interface QuoteTotals {
  linesSubtotalCents: number;
  deliveryFeeCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
}

export interface QuoteTotalsOptions {
  delivery: boolean;
  deliveryFeeCents: number;
  taxRateBps: number;
  taxExempt: boolean;
  depositPercentBps: number;
  depositMinimumCents: number;
  /** An explicit deposit set by staff overrides the percentage entirely. */
  depositOverrideCents?: number | null;
}

/**
 * Totals for a quote. Rounding happens twice in total and both places are named:
 * once for tax, once for the deposit. Neither result feeds the other.
 *
 * Delivery fee is part of the taxable subtotal — a delivery is a taxable service
 * in every state that taxes rentals at all, and getting it wrong is the kind of
 * thing that turns up in an audit rather than in a bug report.
 *
 * The deposit floor only applies when there is something to hold a deposit
 * against: a zero-line quote has a zero deposit, not a $50 one.
 */
export function quoteTotals(
  lines: readonly QuoteLineInput[],
  opts: QuoteTotalsOptions,
): QuoteTotals {
  const linesSubtotalCents = lines.reduce(
    (sum, line) => sum + Math.max(0, Math.trunc(line.quantity)) * Math.trunc(line.rateCents),
    0,
  );
  const deliveryFeeCents = opts.delivery ? Math.max(0, Math.trunc(opts.deliveryFeeCents)) : 0;
  const subtotalCents = linesSubtotalCents + deliveryFeeCents;
  const taxCents = opts.taxExempt ? 0 : applyBps(subtotalCents, Math.max(0, opts.taxRateBps));
  const totalCents = subtotalCents + taxCents;

  let depositCents: number;
  if (opts.depositOverrideCents !== null && opts.depositOverrideCents !== undefined) {
    depositCents = Math.max(0, Math.trunc(opts.depositOverrideCents));
  } else if (linesSubtotalCents <= 0) {
    depositCents = 0;
  } else {
    depositCents = Math.max(
      applyBps(linesSubtotalCents, Math.max(0, opts.depositPercentBps)),
      Math.max(0, Math.trunc(opts.depositMinimumCents)),
    );
  }

  return {
    linesSubtotalCents,
    deliveryFeeCents,
    subtotalCents,
    taxCents,
    totalCents,
    depositCents,
  };
}

/**
 * A late return is billed at the daily rate for each day past due. Computed as
 * of a date rather than stored, so it cannot go stale — the "Due" chip on an
 * invoice 212 days late defect is exactly this mistake in another app.
 */
export function lateFeeCents(
  lines: readonly { quantity: number; dailyRateCents: number }[],
  dueBackOn: IsoDate,
  asOf: IsoDate,
): number {
  const daysLate = Math.max(0, daysBetween(dueBackOn, asOf));
  if (daysLate === 0) return 0;
  return lines.reduce((sum, l) => sum + l.quantity * l.dailyRateCents, 0) * daysLate;
}
