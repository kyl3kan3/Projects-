/**
 * src/worker/index.ts
 *
 * Standalone worker process (`npm run worker`, tsx). Owns every job in
 * ARCHITECTURE.md's Queue & Worker Jobs table.
 *
 * Queues (BullMQ over env.redisUrl — one shared ioredis connection,
 * maxRetriesPerRequest: null):
 * - send-reminders       delayed per appointment (48h/2h before start)
 * - flag-noshows         repeatable every 15 min (ended 30+ min, unmarked)
 * - capture-fee          enqueued when the stylist marks no-show/late-cancel
 * - cadence-scan         nightly per stylist
 * - send-nudge           from cadence-scan, consent + caps enforced
 * - offer-waitlist       enqueued when a slot frees
 * - rent-rollover        weekly per shop, shop-local Monday
 * - process-stripe-event enqueued by both webhook routes
 *
 * TODO:
 * - [ ] queue() singleton helper with globalThis caching (see
 *       apps/02-dunly for the proven pattern).
 * - [ ] capture-fee concurrency 1 per appointment (idempotency key
 *       `appointment:{id}:fee` guards double charges).
 * - [ ] Dead-letter queue + Sentry on repeated failure; DRY_RUN
 *       short-circuits Twilio/Resend/Stripe with structured logs.
 * - [ ] Graceful shutdown: SIGTERM drains active jobs.
 */

async function main(): Promise<void> {
  throw new Error("Not implemented: register queues, workers, and repeatable jobs");
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
