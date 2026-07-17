/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint: RecallDesk's own subscription lifecycle.
 * Verify -> idempotent persist -> enqueue -> ack. No business logic inline.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Idempotency: insert webhook_events by Stripe event id; duplicate ->
 *       ack 200 and stop.
 * - [ ] checkout.session.completed / customer.subscription.updated|deleted /
 *       invoice.payment_failed: enqueue process-stripe-event.
 * - [ ] Return 200 in <1s; failures -> Sentry + retry via Stripe.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 6
  return new Response("Not implemented", { status: 501 });
}
