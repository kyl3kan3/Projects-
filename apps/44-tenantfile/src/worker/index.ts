/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately; `npm run worker`).
 * Owns everything time-based: monthly charge generation, reminder sends,
 * late-fee application, and File PDF exports.
 *
 * TODO:
 * - [ ] Queues: generate-charges (monthly repeatable), send-reminder,
 *       apply-late-fee (daily repeatable), export-file-pdf, notify-thread.
 * - [ ] Send-time re-checks live in the job handlers (paid charge = skip).
 * - [ ] DRY_RUN=1 short-circuits outbound email/SMS with structured logs.
 * - [ ] Dead-letter queue + Sentry on repeated failures.
 * - [ ] Graceful shutdown (drain on SIGTERM).
 */

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
