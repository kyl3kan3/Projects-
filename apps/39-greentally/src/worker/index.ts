/**
 * src/worker/index.ts
 *
 * Long-lived worker process: BullMQ queues for extraction, classification,
 * footprint recompute, and PDF rendering. Deployed to Railway/Fly separately
 * from the Next.js app; shares src/db and src/lib.
 *
 * TODO:
 * - [ ] Queue definitions: extract-document, classify-spend,
 *       compute-footprint, render-report.
 * - [ ] Worker registration with per-queue concurrency (render-report = 1,
 *       Chromium is heavy) and exponential backoff.
 * - [ ] Dead-letter queue + Sentry capture on final failure.
 * - [ ] Graceful shutdown (drain jobs, close Chromium, close DB).
 */

export {};
