/**
 * server/src/lib/splits.ts
 *
 * The split engine: per-gig rules (equal / weighted / leader-cut /
 * fixed sideman rates from the lineup) over recorded payments,
 * integer cents, LARGEST-REMAINDER — sum(splits) equals
 * sum(payments) exactly; a lost cent is a bug.
 *
 * TODO:
 * - [ ] computeSplits(gig, payments, rule, lineup): pure; sideman
 *       fixed rates carve first, remainder splits by rule.
 * - [ ] recompute(gigId): on every recorded payment; upsert by
 *       (gig, member); exact-sum property test is the centerpiece.
 * - [ ] settleUp(bandId): aggregate owed per member across gigs.
 */

export interface SplitLine {
  memberId: string;
  amountCents: number;
  ruleApplied: Record<string, unknown>;
}

export function computeSplits(input: {
  totalCents: number;
  rule: { kind: "equal" | "weighted" | "leader_cut" | "fixed_sideman" };
  lineup: Array<{ memberId: string; role: string; rateCents?: number; weight?: number }>;
}): SplitLine[] {
  throw new Error("Not implemented");
}

export async function recompute(gigId: string): Promise<{ lines: number }> {
  throw new Error("Not implemented");
}
