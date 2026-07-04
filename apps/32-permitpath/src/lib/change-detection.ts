/**
 * src/lib/change-detection.ts
 *
 * Change-detection pipeline for monitored jurisdiction pages: fetch,
 * extract the content region, normalize, hash, diff against the stored
 * snapshot, and flag meaningful changes for human review. Nothing in this
 * module ever publishes a requirement change -- it only produces pending
 * review items.
 *
 * TODO:
 * - [ ] fetchSource(source): polite GET with CRAWLER_USER_AGENT,
 *       conditional headers (ETag/If-Modified-Since), timeout, and
 *       per-host serialization (concurrency 1 per host).
 * - [ ] extractContent(html, selector): cheerio extraction of the content
 *       region (fall back to <main>/<body>), strip nav/footer/script noise,
 *       normalize whitespace.
 * - [ ] computeDiff(previous, current): jsdiff line diff + a human-readable
 *       summary ("3 lines added near 'mechanical permit'").
 * - [ ] recordSnapshot(sourceId, content, hash): update
 *       jurisdiction_sources.last_snapshot_hash / last_crawled_at.
 * - [ ] createPendingChange(sourceId, diff): requirement_changes row with
 *       review_state = "pending" for the curation console.
 * - [ ] markBroken(sourceId): status = "broken" after 3 consecutive
 *       failures -- silence must never read as "no change".
 */

export interface CrawlResult {
  sourceId: string;
  status: "unchanged" | "changed" | "failed";
  snapshotHash: string | null;
  error: string | null;
}

export interface DiffSummary {
  summary: string;
  rawDiff: string;
  addedLines: number;
  removedLines: number;
}

export function crawlSource(_sourceId: string): Promise<CrawlResult> {
  throw new Error("Not implemented");
}

export function computeDiff(
  _previous: string,
  _current: string,
): DiffSummary {
  throw new Error("Not implemented");
}
