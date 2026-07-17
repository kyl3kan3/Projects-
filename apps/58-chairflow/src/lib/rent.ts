/**
 * src/lib/rent.ts
 *
 * The chair-rent split ledger (Shop tier). Weekly rows per occupied
 * chair, due Monday shop-local; paid via Stripe payment link to the
 * owner's account or marked paid manually (cash) — both sides see the
 * same row flip. Late at +3 days. ChairFlow takes no cut in v1.
 *
 * TODO:
 * - [ ] rolloverWeek(shopId, weekStartOn): insert rent_periods per
 *       occupied chair, idempotent by (chair, week).
 * - [ ] markPaid(rentPeriodId, { via: "link" | "manual", note? }).
 * - [ ] escalateLate(shopId, today): due -> late at +3 days; notify
 *       both sides once (messages ledger dedupes).
 * - [ ] ownerGrid(shopId, weeks): chairs x weeks matrix for the
 *       dashboard — the crumpled envelope, replaced.
 */

export async function rolloverWeek(shopId: string, weekStartOn: string): Promise<{ opened: number }> {
  throw new Error("Not implemented");
}

export async function markPaid(
  rentPeriodId: string,
  input: { via: "link" | "manual"; note?: string },
): Promise<void> {
  throw new Error("Not implemented");
}
