/**
 * Dead-stock classification and ranking — the pure half.
 *
 * Dead stock is the "equal enemy" in the README, and it needs its own rules
 * because the arithmetic that finds a stockout does not find this: a SKU with 194
 * days of cover has a perfectly healthy-looking reorder point that will never fire,
 * so nothing draws attention to the £3,816 sitting under it.
 *
 * The ranking is by cash tied up, not by days of cover. A shelf of 400 units of a
 * £2 item is a tidier problem than 40 units of a £90 one, and the merchant's
 * question is "where is my money", not "what is slowest".
 */

import type { Trend } from "@/db/schema";

export interface DeadStockCandidate {
  variantId: string;
  units: number;
  daysOfCover: number | null;
  cashTiedUpCents: number;
  trend: Trend;
  /** Observed (in-stock) days behind the velocity figure. */
  observedDays: number;
  /** True when the variant has been out of stock for the entire window. */
  demandCensored: boolean;
  snoozedUntil: Date | null;
  sku: string;
}

export interface DeadStockThresholds {
  deadCoverDays: number;
  overstockCoverDays: number;
}

/**
 * Is this dead stock?
 *
 * Three guards, each protecting against a specific false positive:
 *
 *  - **`demandCensored`** — a variant that has had nothing to sell has no measured
 *    velocity, so its "infinite cover" is an artefact. Calling that dead is how a
 *    best-seller gets discounted.
 *  - **`trend === "rising"`** — cover is a snapshot; a SKU with 150 days of cover
 *    that is accelerating is over-bought, not dead.
 *  - **`observedDays`** — a product added a fortnight ago has not had time to
 *    prove anything.
 */
export function isDeadStock(
  candidate: DeadStockCandidate,
  thresholds: DeadStockThresholds,
  minObservedDays = 30,
): boolean {
  if (candidate.demandCensored) return false;
  if (candidate.units <= 0) return false;
  if (candidate.observedDays < minObservedDays) return false;
  if (candidate.trend === "rising") return false;
  // No velocity at all with a full window of in-stock days: it is not selling.
  if (candidate.daysOfCover === null) return true;
  return candidate.daysOfCover > thresholds.deadCoverDays;
}

/** Still selling, but holding far more than it needs. */
export function isOverstocked(
  candidate: DeadStockCandidate,
  thresholds: DeadStockThresholds,
): boolean {
  if (candidate.daysOfCover === null) return false;
  return (
    candidate.daysOfCover > thresholds.overstockCoverDays &&
    candidate.daysOfCover <= thresholds.deadCoverDays
  );
}

/** Snoozed SKUs are excluded — the merchant has already decided about them. */
export function rankDeadStock<T extends { cashTiedUpCents: number; sku: string; snoozedUntil: Date | null }>(
  rows: T[],
  now: Date = new Date(),
): T[] {
  return rows
    .filter((row) => !(row.snoozedUntil !== null && row.snoozedUntil > now))
    .slice()
    .sort((a, b) => b.cashTiedUpCents - a.cashTiedUpCents || a.sku.localeCompare(b.sku));
}

/**
 * The plain-language action beside a dead-stock row. Strings only in v1 — nothing
 * here changes a price or creates a discount, and the UI does not imply it does.
 */
export function suggestedAction(row: {
  units: number;
  daysOfCover: number | null;
  cashTiedUpCents: number;
}): string {
  if (row.daysOfCover === null) return "Discount or bundle — it has stopped selling entirely.";
  if (row.daysOfCover > 365) return "Write-off territory. Discount hard or clear it in a bundle.";
  if (row.cashTiedUpCents > 200_000) return "Biggest cash drag. A 20% discount clears it fastest.";
  return "Bundle it with a fast mover, or discount at the next sale.";
}
