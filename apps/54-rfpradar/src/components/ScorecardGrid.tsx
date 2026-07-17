/**
 * ScorecardGrid — the go/no-go worksheet.
 *
 * Criteria rows scored 1-5 with notes; the weighted verdict recomputes
 * live as scores change; the decision row records who decided and when.
 * A recorded "no" renders with the same weight as a "go" — the honest
 * denominator is the product.
 *
 * TODO:
 * - [ ] Controlled rows from scorecards.criteria jsonb.
 * - [ ] Live verdict math (weights x scores -> go / conditional / no-go
 *       bands) shown as arithmetic, not a black box.
 * - [ ] Submit = server action stamping decided_by/decided_at +
 *       audit_log; no_bid closes the pursuit with the reason.
 */

"use client";

export interface ScorecardGridProps {
  pursuitId: string;
  criteria: Array<{ key: string; label: string; weight: number; score1to5: number | null; note: string }>;
}

export function ScorecardGrid(props: ScorecardGridProps) {
  void props;
  return <div className="placard p-4">Not implemented</div>;
}
