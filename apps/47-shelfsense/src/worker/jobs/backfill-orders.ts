/**
 * src/worker/jobs/backfill-orders.ts
 *
 * 90-day order backfill for a newly installed shop. Populates
 * sales_daily and product/variant mirrors, then triggers the first
 * forecast run (ARCHITECTURE.md flow 1).
 *
 * TODO:
 * - [ ] Page orders via lib/shopify pageOrders with cursor checkpoints
 *       persisted in the job payload -- resumable after any failure.
 * - [ ] Respect Admin API cost limits (backoff on throttleStatus).
 * - [ ] Upsert products/variants/inventory_levels; increment sales_daily
 *       (unique on variant_id + date -- idempotent re-runs).
 * - [ ] Mark stockout-censored days (inventory 0) so velocity math can
 *       exclude them (lib/velocity).
 * - [ ] On completion: set shops.backfill_completed_at, enqueue an
 *       immediate recompute-forecasts run, emit progress for the
 *       onboarding screen's real counts.
 */

export interface BackfillJobData {
  shopId: string;
  cursor: string | null;
}

export async function runBackfillOrders(_data: BackfillJobData): Promise<void> {
  throw new Error("Not implemented");
}
