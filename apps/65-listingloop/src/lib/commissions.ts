/**
 * src/lib/commissions.ts
 *
 * Per-deal commission math shown as lines (rate x price, each split
 * named, TC fee), and pipeline totals by month of expected close.
 * Arithmetic rendered, never summarized.
 *
 * TODO: dealLines(deal): [{ label, amountCents }]; pipelineByMonth
 * (accountId): [{ month, expectedCents, dealCount }].
 */

export interface CommissionLine {
  label: string;
  amountCents: number;
}

export async function dealLines(dealId: string): Promise<CommissionLine[]> {
  throw new Error("Not implemented");
}

export async function pipelineByMonth(
  accountId: string,
): Promise<Array<{ month: string; expectedCents: number; dealCount: number }>> {
  throw new Error("Not implemented");
}
