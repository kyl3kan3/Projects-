/**
 * server/src/lib/series.ts
 *
 * The Line's data: one point per close + today's provisional point
 * (sum of latest balances per active account, debts negative).
 *
 * TODO:
 * - [ ] getSeries(nestId): closes ascending + provisional point with
 *       { provisional: true }.
 * - [ ] currentTotals(nestId): assets/debts/net from latest balances
 *       (one SQL with DISTINCT ON per account).
 * - [ ] closeMonth(nestId, memberId, adjustments, note): validate
 *       month not closed; write manual balances for adjusted rows;
 *       insert the immutable closes row; audit.
 */

export async function getSeries(
  nestId: string,
): Promise<Array<{ month: string; netWorthCents: number; provisional: boolean }>> {
  throw new Error("Not implemented");
}

export async function closeMonth(
  nestId: string,
  memberId: string,
  adjustments: Array<{ accountId: string; balanceCents: number }>,
  note: string | null,
): Promise<{ closeId: string }> {
  throw new Error("Not implemented");
}
