/**
 * src/lib/compute.ts
 *
 * THE product: the pure share-computation engine.
 *
 * computeShares(pool total, entries, rules):
 *   1. participants filtered by role (exclusions honored)
 *   2. weight = points x hours (when hoursWeighted) else points
 *   3. tip-shares carved first (percent of sales/tips to a role,
 *      split among that role's participants by the same weighting)
 *   4. remaining pool allocated by weight
 *   5. LARGEST-REMAINDER cent allocation — the shares sum to the pool
 *      EXACTLY; a lost cent is a bug, not a rounding note
 *   6. every share carries its derivation steps (label + expression +
 *      value) for verbatim rendering
 *
 * TODO:
 * - [ ] computeShares(input): pure; exhaustive test suite (multi-pool,
 *       tip-shares, zero-hour edge, one-participant, exact-sum
 *       property test).
 * - [ ] effectiveVersion(poolId, serviceDate): the append-only lookup.
 * - [ ] ruleSentences(rules): the human rendering for the rules UI.
 */

export interface ComputeEntry {
  employeeId: string;
  roleKey: string;
  hours: number;
  salesCents: number;
  tipsCollectedCents: number;
}

export interface DerivationStep {
  label: string;
  expression: string;
  valueCents?: number;
}

export interface ComputedShare {
  employeeId: string;
  amountCents: number;
  derivation: DerivationStep[];
}

export function computeShares(input: {
  poolTotalCents: number;
  entries: ComputeEntry[];
  rules: {
    participants: Array<{ roleKey: string; points: number }>;
    hoursWeighted: boolean;
    tipShares: Array<{
      percentOfSalesBps?: number;
      percentOfTipsBps?: number;
      toRoleKey: string;
    }>;
    exclusions: string[];
  };
}): ComputedShare[] {
  throw new Error("Not implemented");
}
