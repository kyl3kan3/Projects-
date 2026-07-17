/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately from the Next.js
 * app; `npm run worker`). Owns everything time-based.
 *
 * Queues/jobs:
 * - refresh-eligibility: nightly per school + after promotion batches —
 *   src/lib/progression.refreshEligibility().
 * - retention-scan: nightly per school — src/lib/retention.scanSchool().
 * - send-announcement: fan out per family via Resend with deliveries rows.
 * - dunning-notices: on invoice.payment_failed + daily follow-up; hosted
 *   payment-update links; escalates to a desk task after 2 failures.
 * - process-stripe-event: apply platform + connect events from
 *   webhook_events, idempotent by event id.
 * - export-report: roster/promotions/attendance CSV or certificate-data
 *   PDF to R2, signed link surfaced in-app.
 *
 * TODO:
 * - [ ] Wire queues + workers with ioredis connection from env.redisUrl.
 * - [ ] Repeatable schedules per school timezone (nightly jobs run at
 *       school-local 3am).
 * - [ ] DRY_RUN=1 short-circuits outbound email + Stripe mutations with
 *       structured logs.
 * - [ ] Dead-letter queue + Sentry on repeated failures.
 * - [ ] Graceful shutdown: drain active jobs on SIGTERM before exit.
 */

export const QUEUES = {
  refreshEligibility: "refresh-eligibility",
  retentionScan: "retention-scan",
  sendAnnouncement: "send-announcement",
  dunningNotices: "dunning-notices",
  processStripeEvent: "process-stripe-event",
  exportReport: "export-report",
} as const;

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
