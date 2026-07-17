/**
 * src/worker/index.ts
 *
 * Standalone worker (`npm run worker`, tsx). Jobs per ARCHITECTURE.md:
 * - reauth-holds          nightly (holds expiring before due-back)
 * - release-holds         clean return check-in
 * - render-docs           sign / run planned (contract + run sheets)
 * - send-reminders        daily (due-back tomorrow, overdue)
 * - process-stripe-event  webhook ack
 *
 * TODO: queue() singleton, DLQ + Sentry, graceful shutdown, DRY_RUN
 * short-circuits Stripe captures/releases and email.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
