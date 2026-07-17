/**
 * server/src/worker/index.ts
 *
 * Jobs per ARCHITECTURE.md:
 * - sync-balances     nightly per institution + webhook-targeted
 * - close-reminders   monthly per nest (close day)
 * - process-webhook   Plaid/RC webhook ack
 *
 * TODO: queue() singleton, DLQ + Sentry, graceful shutdown, DRY_RUN
 * fixtures for Plaid.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
