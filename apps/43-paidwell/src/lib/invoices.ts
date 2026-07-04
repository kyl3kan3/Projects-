/**
 * src/lib/invoices.ts
 *
 * Accounting sync: QuickBooks Online + Xero OAuth, invoice/contact/payment
 * mirroring, and CSV import. The synced balance is the ground truth the
 * sequence engine re-checks before every send.
 *
 * TODO:
 * - [ ] OAuth flows for QBO (intuit-oauth) and Xero (xero-node); token
 *       refresh + rotation stored on accounting_connections.
 * - [ ] backfill(connectionId): open invoices + 12 months of history,
 *       paged, idempotent on (firm_id, provider, external_id).
 * - [ ] incrementalSync(connectionId): webhook-triggered + nightly poll;
 *       update balances, detect payments recorded outside PaidWell.
 * - [ ] computeClientStats(clientId): avg days-to-pay, reliability score
 *       from historical invoice -> payment gaps.
 * - [ ] writeBackPayment(paymentId): record a portal payment against the
 *       invoice in QBO/Xero; stamp recorded_to_accounting_at.
 * - [ ] importCsv(firmId, file): column mapping + validation (zod).
 */

export interface ClientStats {
  avgDaysToPay: number;
  reliabilityScore: number; // 0..1, share of promises/terms kept
  invoiceCount: number;
}

export function backfill(_connectionId: string): Promise<void> {
  throw new Error("Not implemented");
}

export function computeClientStats(_clientId: string): Promise<ClientStats> {
  throw new Error("Not implemented");
}
