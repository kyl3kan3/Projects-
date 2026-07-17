/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately from the Next.js
 * app; `npm run worker`). Owns the pipeline and everything time-based.
 *
 * Queues/jobs (payloads are IDs only — PHI never enters Redis):
 * - transcribe-session: R2 audio -> Deepgram -> transcript rows; then
 *   enqueues draft-note. Retries 3x exponential; terminal failure marks
 *   the session failed with a human-readable reason.
 * - draft-note: transcript/shorthand -> per-section LLM draft with span
 *   citations; writes version 1, flips status to draft.
 * - redraft-section: regenerate one section; everything else untouched.
 * - purge-artifacts: nightly repeatable per practice-local midnight —
 *   src/lib/retention.purgeExpiredArtifacts().
 * - export-notes-pdf: render signed-note PDF(s) to R2, surface a
 *   short-lived signed link in-app (never emailed).
 * - process-stripe-event: apply plan state from webhook_events,
 *   idempotent by event id.
 *
 * TODO:
 * - [ ] Wire queues + workers with ioredis connection from env.redisUrl.
 * - [ ] Concurrency: transcribe/draft limited per practice (fairness);
 *       purge single-flight.
 * - [ ] DRY_RUN=1 short-circuits ASR/LLM with fixtures and logs sends.
 * - [ ] Dead-letter queue + Sentry (PII-scrubbed) on repeated failures.
 * - [ ] Graceful shutdown: drain active jobs on SIGTERM before exit.
 */

export const QUEUES = {
  transcribeSession: "transcribe-session",
  draftNote: "draft-note",
  redraftSection: "redraft-section",
  purgeArtifacts: "purge-artifacts",
  exportNotesPdf: "export-notes-pdf",
  processStripeEvent: "process-stripe-event",
} as const;

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
