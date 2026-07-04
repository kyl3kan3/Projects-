/**
 * src/worker/index.ts
 *
 * Standalone worker entrypoint (`npm run worker`): OT scans, cost
 * rollups, export generation, alert fan-out. Long-lived Node process on
 * Railway/Fly; shares src/db and src/lib with the app.
 *
 * TODO:
 * - [ ] BullMQ connection from REDIS_URL (ioredis, TLS).
 * - [ ] Queues + workers: overtime-scan (hourly sweep, per-org timezone
 *       gating), job-cost-rollup, export-generate, alert-send.
 * - [ ] Overtime approach alerts (at 36h of a 40h threshold) to the
 *       owner/foreman via SMS where opted in, email always; DRY_RUN=1
 *       logs instead of sending.
 * - [ ] Repeatables: nightly stale-open-entry flagging; hourly rollups.
 * - [ ] Per-org rate limiting on alert-send; dead-letter queue with
 *       Sentry alerting on repeated failures.
 * - [ ] Graceful shutdown: drain in-flight jobs on SIGTERM.
 * - [ ] Health endpoint for the host's liveness probe.
 */

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
