/**
 * src/api/worker.ts
 *
 * BullMQ worker: run-diff (engine over canonical docs), notify (Slack +
 * outbound webhooks + email with backoff and DLQ), render-changelog,
 * generate-contract-tests.
 *
 * TODO:
 * - [ ] Queue registration + per-queue concurrency; diff jobs are
 *       CPU-cheap and can run wide.
 * - [ ] Webhook delivery: retries with exponential backoff, dead-letter
 *       after N attempts, delivery log rows.
 * - [ ] Auto-draft changelog entry on any non-compatible diff.
 * - [ ] Sentry capture on final failure; graceful shutdown.
 */

export {};
