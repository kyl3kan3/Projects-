/**
 * src/worker/index.ts
 *
 * Long-lived worker entrypoint (Railway/Fly). Registers BullMQ workers
 * and repeatable jobs; shares src/db and src/lib with the Next.js app.
 *
 * TODO:
 * - [ ] BullMQ connection from REDIS_URL (ioredis, TLS).
 * - [ ] Workers: process-webhook, backfill-orders, recompute-forecasts,
 *       send-digests, send-po.
 * - [ ] Repeatable: recompute-forecasts nightly per shop in the shop's
 *       timezone (~02:00 local); weekly digest; monthly dead-stock digest.
 * - [ ] Per-shop rate limiting so one big backfill can't starve others.
 * - [ ] Dead-letter queue + Sentry on repeated failure; graceful
 *       shutdown draining active jobs.
 * - [ ] Health endpoint for the host's liveness probe.
 */

export async function main(): Promise<void> {
  throw new Error("Not implemented");
}
