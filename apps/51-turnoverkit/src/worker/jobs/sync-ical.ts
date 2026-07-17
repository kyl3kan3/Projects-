/**
 * src/worker/jobs/sync-ical.ts
 *
 * The 15-minute feed poll (ARCHITECTURE.md flow 1, steps 1-3).
 *
 * TODO:
 * - [ ] Load the feed row; fetchFeed(url); if hash === last_hash, stamp
 *       last_synced_at and stop (short-circuit).
 * - [ ] parseStays -> upsert by (feed_id, external_uid); mark rows absent
 *       from the feed as cancelled (never delete -- history).
 * - [ ] diffStays -> if any created/moved/cancelled, enqueue
 *       reflow-turnovers for the unit with the diff summary.
 * - [ ] On fetch/parse failure: retry via BullMQ backoff; after final
 *       attempt mark ical_feeds.status = "error" with error_note so the
 *       unit surfaces "calendar unreachable since 2:10pm" -- never
 *       silently stale.
 * - [ ] Idempotent by construction: same feed content -> zero writes.
 */

export interface SyncIcalJobData {
  feedId: string;
}

export async function syncIcalJob(_data: SyncIcalJobData): Promise<void> {
  throw new Error("Not implemented");
}
