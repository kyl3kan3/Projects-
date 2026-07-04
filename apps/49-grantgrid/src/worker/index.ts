/**
 * src/worker/index.ts
 *
 * Long-lived worker entrypoint (Railway/Fly). Registers BullMQ workers
 * and repeatable jobs; shares src/db and src/lib with the Next.js app.
 *
 * TODO:
 * - [ ] BullMQ connection from REDIS_URL (ioredis, TLS).
 * - [ ] Workers: send-reminder, ingest-990s, weekly-digest,
 *       fit-check-email (the public lead magnet).
 * - [ ] Repeatable: deadline-scan nightly (per-org timezone-aware);
 *       weekly pipeline digest; monthly staleness sweep over answer
 *       blocks.
 * - [ ] Ingestion runs off-peak with per-batch checkpoints (resumable).
 * - [ ] Dead-letter queue + Sentry on repeated failure; graceful
 *       shutdown draining active jobs.
 * - [ ] DRY_RUN=1 short-circuits all outbound email.
 */

export async function main(): Promise<void> {
  throw new Error("Not implemented");
}
