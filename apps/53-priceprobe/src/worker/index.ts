/**
 * src/worker/index.ts
 *
 * Long-lived worker entrypoint (Railway/Fly, run with `npm run worker`).
 * Registers BullMQ workers and repeatable jobs; shares src/db and src/lib
 * with the Next.js app. See ARCHITECTURE.md "Queue & Worker Jobs".
 *
 * Queues and jobs:
 *  - schedule-checks       repeatable, every 5 min: enqueue due pages
 *  - scrape-page           per-domain limiter groups (politeness lives here)
 *  - detect-changes        on new snapshot
 *  - send-alert            change_events x alert_rules fan-out
 *  - recompute-suggestions change events + rule edits
 *  - morning-digest        daily per brand, brand-local hour
 *  - process-stripe-event  enqueued by the webhook route after persist
 *
 * TODO:
 * - [ ] BullMQ connection from env.redisUrl (ioredis, TLS,
 *       maxRetriesPerRequest: null).
 * - [ ] scrape-page uses BullMQ group rate limiting keyed by domain:
 *       one group per scrape_domains row, rate = min_interval_seconds
 *       with +-10% jitter; two domains run in parallel, one domain never
 *       overlaps itself.
 * - [ ] Job ids: scrape-page = `${pageId}:${dueSlot}` so a page already
 *       queued for a slot is skipped (idempotent scheduling).
 * - [ ] Retries: scrape 2x backoff then failure ladder; others 3x
 *       exponential; dead-letter queue + Sentry on repeated failure.
 * - [ ] Graceful shutdown: SIGTERM drains active jobs, closes Redis + PG.
 * - [ ] env.dryRun short-circuits all outbound email/Slack with a log line.
 */

export const QUEUE_NAMES = [
  "schedule-checks",
  "scrape-page",
  "detect-changes",
  "send-alert",
  "recompute-suggestions",
  "morning-digest",
  "process-stripe-event",
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export async function main(): Promise<void> {
  throw new Error("Not implemented");
}
