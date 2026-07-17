/**
 * src/worker/index.ts
 *
 * Standalone worker process (`npm run worker`, tsx). Owns every
 * recurring job in ARCHITECTURE.md's Queue & Worker Jobs table.
 *
 * Queues (BullMQ over env.redisUrl — reuse one ioredis connection,
 * maxRetriesPerRequest: null):
 * - poll-sources        repeatable per source (poll_interval_minutes)
 * - score-matches       fan-out on new/changed opportunities + profile edits
 * - morning-scan        daily per firm at their local scan hour
 * - deadline-reminders  nightly; T-7/3/1 exactly-once via reminders ledger
 * - refresh-staleness   weekly; recompute answer_blocks.stale
 * - process-stripe-event enqueued by the webhook route
 *
 * TODO:
 * - [ ] queue() singleton helper with globalThis caching (see
 *       apps/02-dunly for the proven pattern).
 * - [ ] Workers with sensible concurrency (poll-sources: 2, per-source
 *       pacing inside the job; score-matches: 8).
 * - [ ] Repeatable schedules registered on boot from the sources table.
 * - [ ] Dead-letter queue + Sentry on repeated failure.
 * - [ ] Graceful shutdown: SIGTERM drains active jobs.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
