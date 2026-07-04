/**
 * src/worker/index.ts
 *
 * Long-lived worker process (deployed to Railway/Fly, `npm run worker`).
 * Owns every BullMQ queue consumer; the Next.js app only enqueues.
 *
 * TODO:
 * - [ ] BullMQ connection from REDIS_URL (ioredis, TLS).
 * - [ ] Workers: extract-document (concurrency ~4, per-org rate limit),
 *       monthly-close, send-digest.
 * - [ ] Repeatables: monthly-close fan-out on the 1st (org-local dates),
 *       weekly digest, stale-queue sweep (documents stuck in `extracting`).
 * - [ ] Retry policy: exponential backoff, max 3 attempts, dead-letter
 *       queue with Sentry alert on DLQ growth.
 * - [ ] Graceful shutdown on SIGTERM (drain in-flight extractions).
 * - [ ] Respect DRY_RUN: log instead of emailing / reporting usage.
 */

export function startWorker(): void {
  throw new Error("Not implemented");
}
