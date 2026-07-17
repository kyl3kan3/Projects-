/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately from the Next.js
 * app; `npm run worker`). Owns everything background and time-based.
 *
 * Queues/jobs (payloads are IDs only — PHI never enters Redis):
 * - process-import: parse CSV from R2 via the PMS recipe -> preview; on
 *   commit, upsert with provenance and enqueue recompute-overdue.
 * - recompute-overdue: nightly per location + after commits — next_due_on
 *   and buckets for the roster.
 * - run-campaign-step: repeatable every 15 min — due enrollments ->
 *   send-touch, with pacing and quiet-hour scheduling.
 * - send-touch: the consent chokepoint + render + send + touches row.
 * - attribute-bookings: nightly per location — the conservative ledger.
 * - build-call-queue: daily per location, pre-opening.
 * - owner-report: monthly per practice + on-demand -> PDF to R2.
 * - process-stripe-event: apply plan state from webhook_events,
 *   idempotent by event id.
 *
 * TODO:
 * - [ ] Wire queues + workers with ioredis connection from env.redisUrl.
 * - [ ] Concurrency: send-touch paced per location (deliverability);
 *       imports single-flight per location.
 * - [ ] DRY_RUN=1 short-circuits outbound email/SMS with structured logs.
 * - [ ] Dead-letter queue + Sentry (PII-scrubbed) on repeated failures.
 * - [ ] Graceful shutdown: drain active jobs on SIGTERM before exit.
 */

export const QUEUES = {
  processImport: "process-import",
  recomputeOverdue: "recompute-overdue",
  runCampaignStep: "run-campaign-step",
  sendTouch: "send-touch",
  attributeBookings: "attribute-bookings",
  buildCallQueue: "build-call-queue",
  ownerReport: "owner-report",
  processStripeEvent: "process-stripe-event",
} as const;

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
