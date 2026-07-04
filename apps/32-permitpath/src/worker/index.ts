/**
 * src/worker/index.ts — Worker entry: crawls + diffs
 *
 * TODO:
 * - [ ] BullMQ queues: crawl-source, diff-requirements, send-alerts
 * - [ ] polite crawl concurrency via CRAWL_CONCURRENCY, per-host caps
 * - [ ] diff -> proposed requirement_changes (never auto-publish; reviewer
 *       approval required per lib/requirements.ts)
 * - [ ] graceful shutdown; Sentry
 */
export {};
