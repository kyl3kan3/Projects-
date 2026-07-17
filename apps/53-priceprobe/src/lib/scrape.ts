/**
 * src/lib/scrape.ts
 *
 * Polite fetching (ARCHITECTURE.md flow 2). Politeness is global and
 * structural: per-domain limiter groups in BullMQ, robots awareness,
 * jitter, backoff, honest failure states.
 *
 * TODO:
 * - [ ] fetchPage(url, domain): HTTPS GET with env.scrapeUserAgent,
 *       10s timeout, no redirect chains past 3; returns { html, hash }
 *       (sha256) for the short-circuit against the last snapshot.
 * - [ ] isAllowedByRobots(url, robotsState): honor cached robots.txt
 *       (refresh weekly per domain via robots-parser); a disallowed path
 *       pauses the page with a clear status note.
 * - [ ] failureLadder(page, error): attempt retries via BullMQ backoff;
 *       after final attempt escalate ok -> warning -> blocked, set the
 *       human-readable status_note, bump domain consecutive_failures,
 *       and set scrape_domains.blocked_until on repeated domain-wide
 *       failures (back off the WHOLE domain -- never hammer).
 * - [ ] nextCheckAt(plan, flagged): per-plan frequency (2/day watch,
 *       4/day desk, hourly for flagged SKUs on floor) with +-10% jitter.
 */

export interface FetchResult {
  html: string;
  hash: string;
  status: number;
}

/** Fetch a page politely; throws typed errors for the failure ladder. */
export async function fetchPage(
  _url: string,
  _domain: string,
): Promise<FetchResult> {
  throw new Error("Not implemented");
}

/** Compute the next check time with plan frequency and jitter. Pure. */
export function nextCheckAt(
  _plan: "watch" | "desk" | "floor",
  _flagged: boolean,
  _now: Date,
): Date {
  throw new Error("Not implemented");
}
