/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately from the Next.js
 * app; `npm run worker`). Owns everything time-based: sequence sends,
 * accounting sync, the promise watcher, and nightly forecast builds.
 *
 * TODO:
 * - [ ] Queues: send-step, sync-connection, watch-promises (daily
 *       repeatable), build-forecast (nightly repeatable), write-back-payment.
 * - [ ] Concurrency + per-firm rate limiting on send-step (deliverability).
 * - [ ] DRY_RUN=1 short-circuits outbound email with structured logs.
 * - [ ] Dead-letter queue + Sentry on repeated failures.
 * - [ ] Graceful shutdown (drain jobs on SIGTERM before exit).
 */

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
