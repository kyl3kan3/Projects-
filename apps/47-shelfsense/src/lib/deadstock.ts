/**
 * src/lib/deadstock.ts
 *
 * Dead-stock detection: SKUs with excessive cover and falling velocity,
 * ranked by cash tied up. Feeds the dead-stock screen and the monthly
 * digest -- the "equal enemy" to stockouts (see README differentiation).
 *
 * TODO:
 * - [ ] isDeadStock(forecast, settings): cover > threshold (default 120d)
 *       AND trend falling or flat; overstocked = cover > 60d but still
 *       selling.
 * - [ ] cashTiedUpCents(variant): units x cost (fall back to price x 0.5
 *       with a "cost missing" flag when cost is unset).
 * - [ ] rankDeadStock(forecasts): descending by cash tied up, snoozed
 *       SKUs excluded.
 * - [ ] monthlyDigestModel(shop): totals + top 10 rows for the email and
 *       the Dead stock screen (same numbers, one source).
 * - [ ] Suggested actions per row: discount / bundle / snooze -- plain
 *       strings for v1, no automation.
 */

export interface DeadStockRow {
  variantId: string;
  title: string;
  sku: string;
  units: number;
  daysOfCover: number;
  cashTiedUpCents: number;
  costMissing: boolean;
}

export function rankDeadStock(_rows: DeadStockRow[]): DeadStockRow[] {
  throw new Error("Not implemented");
}
