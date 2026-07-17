/**
 * src/lib/ledger.ts
 *
 * The append-only tenant ledger. Every charge, payment, fee, credit
 * as a signed-cents row with a running balance cache; corrections are
 * new `adjustment` rows with descriptions, never edits.
 *
 * TODO:
 * - [ ] post(tenancyId, kind, amountCents, description, meta?):
 *       transaction — insert + recompute balance_after; audit on
 *       adjustments.
 * - [ ] balance(tenancyId): latest balance_after (0 when empty).
 * - [ ] statement(tenancyId, range): the balance-forward statement
 *       rows for PDFs.
 * - [ ] prorate(rateCents, fromDate, rule): move-in/out math with the
 *       rule from owner settings.
 */

export async function post(
  tenancyId: string,
  kind:
    | "rent"
    | "late_fee"
    | "lien_fee"
    | "payment"
    | "credit"
    | "refund"
    | "adjustment",
  amountCents: number,
  description: string,
): Promise<{ entryId: string; balanceAfterCents: number }> {
  throw new Error("Not implemented");
}

export async function balance(tenancyId: string): Promise<number> {
  throw new Error("Not implemented");
}
