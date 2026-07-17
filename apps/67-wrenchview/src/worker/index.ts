/**
 * src/worker/index.ts
 *
 * Standalone worker (`npm run worker`, tsx). Jobs per ARCHITECTURE.md:
 * - process-media         upload complete (sharp thumb/web)
 * - send-report           advisor sends
 * - schedule-followups    line declined / nightly sweep
 * - render-pdf            request / decided
 * - process-stripe-event  webhook ack
 *
 * TODO: queue() singleton, DLQ + Sentry, graceful shutdown, DRY_RUN.
 * next.config.ts already lists sharp in serverExternalPackages.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
