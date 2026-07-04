/**
 * src/worker/jobs/recompute-forecasts.ts
 *
 * Nightly per-shop forecast recompute (ARCHITECTURE.md flow 3). The
 * product's heartbeat: velocities -> reorder points -> order-by dates ->
 * revenue-at-risk -> alert transitions.
 *
 * TODO:
 * - [ ] Load tracked variants + sales_daily windows in batches (keep
 *       memory flat on 5k-SKU shops).
 * - [ ] Compute via lib/velocity + lib/reorder; write one forecasts row
 *       per variant per run with the full inputs jsonb audit trail.
 * - [ ] Status transitions: raise alerts on entry into order_now /
 *       dead_stock; resolve on exit; respect snoozed_until.
 * - [ ] Aggregate shop revenue-at-risk; must equal the sum of per-SKU
 *       figures to the cent (ROADMAP acceptance criterion).
 * - [ ] Rate-limited alert email on newly order_now SKUs (one per SKU
 *       per crossing, dedup via alerts ledger).
 * - [ ] Prune forecast rows older than 180 days.
 */

export interface RecomputeJobData {
  shopId: string;
  runDate: string; // ISO yyyy-mm-dd in shop timezone
}

export async function runRecomputeForecasts(_data: RecomputeJobData): Promise<void> {
  throw new Error("Not implemented");
}
