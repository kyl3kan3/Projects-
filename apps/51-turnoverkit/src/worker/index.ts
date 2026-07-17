/**
 * src/worker/index.ts
 *
 * Long-lived worker entrypoint (Railway/Fly, run with `npm run worker`).
 * Registers BullMQ workers and repeatable jobs; shares src/db and src/lib
 * with the Next.js app. See ARCHITECTURE.md "Queue & Worker Jobs".
 *
 * Queues and jobs:
 *  - sync-ical            repeatable, every 15 min per feed (jittered)
 *  - reflow-turnovers     enqueued by stay diffs and unit/template edits
 *  - notify-cleaner       enqueued by re-flow; SMS first, email fallback
 *  - stock-digest         daily per host, host-local morning
 *  - process-stripe-event enqueued by the webhook route after persist
 *  - export-record-pdf    on host request
 *
 * TODO:
 * - [ ] BullMQ connection from env.redisUrl (ioredis, TLS,
 *       maxRetriesPerRequest: null).
 * - [ ] Register the six workers above with per-queue concurrency
 *       (sync-ical 4, notify-cleaner 8, others 2).
 * - [ ] Repeatable schedules: sync-ical every 15 min with per-feed jitter;
 *       stock-digest hourly gate that fires per host at their local 7am.
 * - [ ] Retries 3x exponential; dead-letter queue + Sentry on repeated
 *       failure; persistent sync failures mark the feed errored.
 * - [ ] Graceful shutdown: SIGTERM drains active jobs, closes Redis + PG.
 * - [ ] env.dryRun short-circuits all outbound SMS/email with a log line.
 */

export const QUEUE_NAMES = [
  "sync-ical",
  "reflow-turnovers",
  "notify-cleaner",
  "stock-digest",
  "process-stripe-event",
  "export-record-pdf",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export async function main(): Promise<void> {
  throw new Error("Not implemented");
}
