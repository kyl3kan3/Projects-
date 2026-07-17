/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook receiver for FleetSnap's own billing.
 * Contract (ARCHITECTURE.md flow 5): verify signature -> idempotent
 * persist -> enqueue -> ack fast. The handler never does the work inline.
 *
 * TODO:
 * - [ ] Read the raw body (no JSON parsing before signature check);
 *       stripe.webhooks.constructEvent with env.stripeWebhookSecret;
 *       400 on bad signature.
 * - [ ] Insert webhook_events by Stripe event id (unique on
 *       provider+external_id); on conflict, ack 200 and stop (duplicate).
 * - [ ] Enqueue process-stripe-event with the webhook_events row id.
 * - [ ] Return 200 within seconds regardless of downstream work.
 * - [ ] Handled types: checkout.session.completed,
 *       customer.subscription.updated, customer.subscription.deleted,
 *       invoice.payment_failed. Everything else: persist + ack, no-op.
 */

export async function POST(_req: Request): Promise<Response> {
  return new Response("Not implemented", { status: 501 });
}
