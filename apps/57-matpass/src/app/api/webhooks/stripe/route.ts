/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint: platform events (MatPass's own billing) AND
 * connected-account events (family tuition on the school's Stripe).
 * Verify -> idempotent persist -> enqueue -> ack. No business logic inline.
 *
 * TODO:
 * - [ ] Verify signature — try STRIPE_WEBHOOK_SECRET (platform), then
 *       STRIPE_CONNECT_WEBHOOK_SECRET (connect) against the raw body.
 * - [ ] Idempotency: insert webhook_events by Stripe event id; duplicate ->
 *       ack 200 and stop.
 * - [ ] invoice.payment_failed / customer.subscription.updated|deleted
 *       (connect): enqueue process-stripe-event (+ dunning-notices for
 *       failures).
 * - [ ] checkout.session.completed / customer.subscription.* (platform):
 *       enqueue process-stripe-event for schools.plan.
 * - [ ] Return 200 in <1s; failures -> Sentry + retry via Stripe.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flows 3 and 5
  return new Response("Not implemented", { status: 501 });
}
