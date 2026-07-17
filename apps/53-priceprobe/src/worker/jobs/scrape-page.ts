/**
 * src/worker/jobs/scrape-page.ts
 *
 * One polite page check (ARCHITECTURE.md flow 2).
 *
 * TODO:
 * - [ ] Load page + domain; skip when domain blocked_until > now or the
 *       page is paused; robots re-check when stale.
 * - [ ] fetchPage(); content_hash === last snapshot's hash -> stamp
 *       last_checked_at + next_check_at and stop (short-circuit, no row).
 * - [ ] extract() with the domain's selector pack; sanityCheck() against
 *       last good reading -- quarantined readings flip the page to
 *       warning ("implausible read held for review"), never alert.
 * - [ ] Write the snapshot, update page provenance fields, enqueue
 *       detect-changes with the snapshot id.
 * - [ ] On error: throw for BullMQ retry; final failure runs the
 *       failure ladder (warning -> blocked + status_note + domain
 *       backoff).
 */

export interface ScrapePageJobData {
  competitorPageId: string;
  dueSlot: string; // ISO minute the check was scheduled for (job-id part)
}

export async function scrapePageJob(_data: ScrapePageJobData): Promise<void> {
  throw new Error("Not implemented");
}
