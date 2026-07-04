/**
 * src/lib/leveling.ts
 *
 * The leveling engine: pivots bids into the side-by-side grid, computes
 * per-row lows, adjusted totals, and the apparent low. This is the product;
 * the math must be boring, exact, and fully explainable.
 *
 * TODO:
 * - [ ] buildLevelingGrid(packageId): rows = bid_form_lines (+ scope-add
 *       rows), columns = active bid revisions; cells carry amount_cents,
 *       mapping provenance, and plug/adjustment markers.
 * - [ ] Per-row low: min across real amounts only (plugs and excluded
 *       cells never win a low).
 * - [ ] Column math: submitted total, + plugs for missing lines,
 *       + normalize/scope adjustments = adjusted total. All integer cents.
 * - [ ] apparentLow(packageId): lowest adjusted total among complete-enough
 *       columns; flag columns whose plug share exceeds a threshold
 *       ("30% of this number is plugs") rather than hiding it.
 * - [ ] Inclusion/exclusion matrix: union of declared scope items across
 *       bids x subs -> included/excluded/unstated; mixed rows flagged as
 *       scope gaps.
 * - [ ] exportLeveling(packageId, format: pdf|csv): the owner-meeting
 *       artifact -- adjustments footnoted, plugs marked, matrix included.
 *       PDF via pdf-lib following DESIGN.md grid treatment.
 */

export interface LevelingCell {
  bidFormLineId: string;
  bidId: string;
  amountCents: number | null;
  isPlug: boolean;
  isLow: boolean;
}

export function buildLevelingGrid(): Promise<LevelingCell[][]> {
  throw new Error("Not implemented");
}
