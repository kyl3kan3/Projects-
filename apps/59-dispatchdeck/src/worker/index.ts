/**
 * src/worker/index.ts
 *
 * Standalone worker process (`npm run worker`, tsx). Owns every job in
 * ARCHITECTURE.md's Queue & Worker Jobs table:
 * - parse-rate-con        inbound email / upload
 * - render-packet         "Build packet" tap
 * - detention-tick        repeatable 5 min
 * - send-invoice          send tap (DRY_RUN logs instead)
 * - rollup-broker-stats   nightly
 * - process-stripe-event  webhook ack
 *
 * TODO:
 * - [ ] queue() singleton with globalThis caching; one shared ioredis
 *       connection (maxRetriesPerRequest: null).
 * - [ ] Dead-letter queue + Sentry on repeated failure.
 * - [ ] Graceful shutdown: SIGTERM drains active jobs.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
