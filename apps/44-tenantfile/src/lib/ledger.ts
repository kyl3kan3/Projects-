/**
 * src/lib/ledger.ts
 *
 * The rent ledger: charges, payments, partial payments, deposits, and
 * late-fee rules. The ledger must stay true even when money moves outside
 * Stripe — manual "mark paid (Zelle/cash/check)" is first-class.
 *
 * TODO:
 * - [ ] generateMonthlyCharges(): worker repeatable; one rent charge per
 *       tenancy per period, unique-constrained (no double rent), skipping
 *       manually adjusted periods.
 * - [ ] recordPayment(chargeId, amount, method, ref?): apply to charge,
 *       handle partials (status "partial"), overpayment -> unapplied credit.
 * - [ ] applyLateFee(chargeId): grace-days check, flat/percent rule,
 *       monthly cap, state-cap acknowledgement required at rule setup;
 *       appends a late_fee charge + notifies both sides.
 * - [ ] waiveCharge(chargeId, reason): audit-logged.
 * - [ ] getLedgerStrip(tenancyId, year): the 12-cell month strip the
 *       dashboard and tenant page both render.
 * - [ ] Every mutation stitches a file_event (see files.ts).
 */

import type { ChargeStatus, PaymentMethod } from "../db/schema";

export interface LedgerCell {
  period: string; // "2026-08"
  status: ChargeStatus;
  amountCents: number;
}

export function recordPayment(
  _chargeId: string,
  _amountCents: number,
  _method: PaymentMethod,
): Promise<void> {
  throw new Error("Not implemented");
}

export function getLedgerStrip(
  _tenancyId: string,
  _year: number,
): Promise<LedgerCell[]> {
  throw new Error("Not implemented");
}
