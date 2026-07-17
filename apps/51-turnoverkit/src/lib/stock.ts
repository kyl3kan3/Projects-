/**
 * src/lib/stock.ts
 *
 * Restock tracking (ARCHITECTURE.md flow 4): counts land with each
 * turnover; par levels turn guest complaints into Tuesday alerts.
 *
 * TODO:
 * - [ ] recordCounts(turnoverId, counts): insert stock_counts rows, update
 *       stock_items.current_count / last_counted_at; a count <= par_level
 *       sets low_since (if unset); zero enqueues an immediate host alert,
 *       otherwise the item waits for the daily digest.
 * - [ ] markRestocked(stockItemId, newCount, userId): reset current_count,
 *       clear low_since, append a stock_counts row attributed to the user.
 * - [ ] lowStockForHost(hostId): items with low_since set, grouped per
 *       unit, ordered zero-first -- the digest's query.
 * - [ ] burnRate(stockItemId): counts-over-time slope (growth-phase par
 *       suggestions hang off this; expose the raw series only for now).
 */

export interface StockCountInput {
  stockItemId: string;
  count: number;
}

export interface LowStockLine {
  unitName: string;
  itemName: string;
  currentCount: number;
  parLevel: number;
  unitLabel: string;
}

/** Persist end-of-job counts from the cleaner flow; trigger low-stock alerts. */
export async function recordCounts(
  _turnoverId: string,
  _counts: StockCountInput[],
  _countedByCleanerId: string,
): Promise<void> {
  throw new Error("Not implemented");
}

/** Everything at or below par for one host, zero-count items first. */
export async function lowStockForHost(
  _hostId: string,
): Promise<LowStockLine[]> {
  throw new Error("Not implemented");
}
