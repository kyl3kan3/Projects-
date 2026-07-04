/**
 * src/app/api/webhooks/stripe/route.ts — Stripe webhook endpoint
 *
 * TODO:
 * - [ ] verify signature (STRIPE_WEBHOOK_SECRET); insert webhook_events
 *       with unique stripe_event_id (duplicate = ack 200, stop)
 * - [ ] subscription created/updated/deleted -> plan + quantity sync
 * - [ ] invoice.payment_failed -> grace state, never instant menu takedown
 * - [ ] return 200 in <1s; no business logic inline
 */
export {};
