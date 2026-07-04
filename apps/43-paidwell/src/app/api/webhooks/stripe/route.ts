/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint: portal payment events (connected accounts) and
 * PaidWell's own subscription lifecycle. Verify, persist, enqueue — no
 * business logic inline; the worker does the rest.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Idempotency: unique event id, duplicate -> ack 200 and stop.
 * - [ ] payment_intent.succeeded (connected): enqueue settle-payment job
 *       (update balance, complete run, write back to accounting).
 * - [ ] checkout.session.completed / customer.subscription.* (platform):
 *       update firms.plan.
 * - [ ] Return 200 in <1s; failures -> Sentry + retry via Stripe.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 3
  return new Response("Not implemented", { status: 501 });
}
