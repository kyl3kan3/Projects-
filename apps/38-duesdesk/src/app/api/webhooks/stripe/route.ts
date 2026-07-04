/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * POST endpoint for Stripe webhooks -- BOTH surfaces: platform events
 * (DuesDesk's own billing) and Connect events (dues settling on the
 * associations' accounts). Two signing secrets, one route.
 *
 * TODO:
 * - [ ] Verify against STRIPE_WEBHOOK_SECRET, falling through to
 *       STRIPE_CONNECT_WEBHOOK_SECRET (raw body; check the Stripe-Account
 *       header to route Connect events).
 * - [ ] Connect: payment_intent.succeeded / .processing / .payment_failed
 *       -> invoicing.applyPayment (ACH honesty rules);
 *       account.updated -> Connect onboarding status.
 * - [ ] Platform: checkout.session.completed, customer.subscription.*
 *       -> associations.plan sync.
 * - [ ] Idempotent by event id; unknown events 200-and-ignore.
 * - [ ] Every money-affecting event writes audit_log.
 */

export async function POST(_request: Request): Promise<Response> {
  throw new Error("Not implemented");
}
