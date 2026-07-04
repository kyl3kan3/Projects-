/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Single Stripe webhook endpoint for both our own billing events and
 * Connect events from contractors' accounts (deposit Checkout sessions).
 * Verify, persist, enqueue -- zero business logic inline.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET against the raw body
 *       (disable body parsing for this route).
 * - [ ] Insert into webhook_events with unique external_event_id; on
 *       conflict, ack 200 and stop (idempotency).
 * - [ ] Enqueue process-webhook job; respond 200 in <1s.
 * - [ ] Route by event type in the worker, not here:
 *       checkout.session.completed (deposits), charge.refunded,
 *       customer.subscription.* and invoice.paid (our billing / metering
 *       reset).
 * - [ ] Distinguish platform vs connected-account events via event.account.
 * - [ ] Alert (Sentry) on signature failures and unknown critical types.
 */

export function POST(_req: Request): Promise<Response> {
  throw new Error("Not implemented");
}
