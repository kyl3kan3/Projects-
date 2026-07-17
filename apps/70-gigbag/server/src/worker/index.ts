/**
 * server/src/worker/index.ts
 *
 * Jobs per ARCHITECTURE.md:
 * - send-reminders    gig-relative offsets, exactly-once per (gig, kind)
 * - render-contract   confirm initiated
 * - process-webhook   Stripe/RC ack (deposit status, entitlement mirror)
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
