/**
 * src/lib/position.ts
 *
 * Price-position math (ARCHITECTURE.md flow 3; DESIGN.md "Position
 * ladder"). Pure functions -- no I/O.
 *
 * TODO:
 * - [ ] computePosition(yourPriceCents, rivals): sorted ladder (in-stock
 *       rivals only for rank; stock-outs listed but unranked), your rank
 *       ("#2 of 5"), delta to nearest below and above.
 * - [ ] exposure(product, ladder): "advantage" | "undercut" |
 *       "floor_breach" | "neutral" -- the semantic color driver. Color
 *       marks YOUR exposure, never market direction.
 * - [ ] exposureSort(products): undercut-and-losing first -- the
 *       dashboard's default order.
 * - [ ] positionDelta(before, after): for change events and the
 *       overnight reveal ("#2 -> #3").
 */

export interface RivalPrice {
  label: string;
  priceCents: number | null;
  inStock: boolean | null;
}

export interface PositionLadder {
  rank: number | null;
  of: number;
  deltaToLowestCents: number | null;
  nearestBelow: RivalPrice | null;
  nearestAbove: RivalPrice | null;
  rows: Array<RivalPrice & { isYou: boolean }>;
}

export type Exposure = "advantage" | "undercut" | "floor_breach" | "neutral";

/** Build the sorted ladder for one SKU. Pure. */
export function computePosition(
  _yourPriceCents: number,
  _rivals: RivalPrice[],
): PositionLadder {
  throw new Error("Not implemented");
}

/** Classify the SKU's exposure for semantic color + sorting. Pure. */
export function exposure(
  _yourPriceCents: number,
  _costFloorCents: number | null,
  _ladder: PositionLadder,
): Exposure {
  throw new Error("Not implemented");
}
