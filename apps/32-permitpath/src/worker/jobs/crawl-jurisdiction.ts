/**
 * src/worker/jobs/crawl-jurisdiction.ts
 *
 * BullMQ job: crawl one monitored jurisdiction source URL and, when the
 * content region changed, hand off to diff computation and the human
 * review queue. This job never publishes requirement changes and never
 * alerts anyone directly -- it only observes and files.
 *
 * TODO:
 * - [ ] Job payload: { sourceId }; load jurisdiction_sources row, skip if
 *       status is paused/broken.
 * - [ ] Fetch via lib/change-detection.crawlSource (polite UA, conditional
 *       GET, timeout, per-host concurrency 1).
 * - [ ] Unchanged hash -> update last_crawled_at, done.
 * - [ ] Changed -> store snapshot, enqueue compute-diff with previous +
 *       current content refs.
 * - [ ] Failure -> increment strike count; 3 strikes -> markBroken and
 *       surface in the curation console (silence never reads as "no
 *       change").
 * - [ ] Respect robots.txt and back off on 429/503 with jittered retry.
 * - [ ] Structured log line per crawl (source, outcome, bytes, ms) for the
 *       coverage-freshness dashboard.
 */

export interface CrawlJobPayload {
  sourceId: string;
}

export function handleCrawlJurisdiction(
  _payload: CrawlJobPayload,
): Promise<void> {
  throw new Error("Not implemented");
}
