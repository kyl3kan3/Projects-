/**
 * src/worker/index.ts
 *
 * Standalone worker (`npm run worker`, tsx). Jobs per ARCHITECTURE.md:
 * - compile-digest        weekly per co-op (Sunday local)
 * - promote-waitlist      seat freed
 * - chase-expiries        weekly
 * - plan-invoices         Stripe schedule events
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
