/**
 * src/worker/index.ts
 *
 * Standalone worker (`npm run worker`, tsx). Jobs per ARCHITECTURE.md:
 * - detect-drift          nightly per trainer
 * - checkin-reminders     client's check-in day
 * - reconcile-billing     Connect webhook + nightly sweep
 * - process-stripe-event  webhook ack
 *
 * TODO: queue() singleton, DLQ + Sentry, graceful shutdown, DRY_RUN.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
