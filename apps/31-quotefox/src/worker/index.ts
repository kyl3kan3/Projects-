/**
 * src/worker/index.ts
 *
 * Worker entrypoint: a long-lived Node process (Railway/Fly) running the
 * BullMQ workers for the transcription/drafting pipeline, proposal sends,
 * follow-up nudges, webhook processing, and scheduled sweeps.
 *
 * TODO:
 * - [ ] Redis connection from REDIS_URL (ioredis, maxRetriesPerRequest:
 *       null per BullMQ requirement).
 * - [ ] Register workers: process-walkthrough, send-proposal, send-nudge,
 *       process-webhook, expiry-sweep (daily repeatable).
 * - [ ] Concurrency + per-org rate limiting on process-walkthrough
 *       (protects the OpenAI budget from one org's bulk day).
 * - [ ] Retry/backoff policy per queue; dead-letter queue with Sentry
 *       alerting on exhaustion.
 * - [ ] Graceful shutdown (SIGTERM: stop intake, drain in-flight jobs).
 * - [ ] Health endpoint for the host's liveness checks.
 */

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
