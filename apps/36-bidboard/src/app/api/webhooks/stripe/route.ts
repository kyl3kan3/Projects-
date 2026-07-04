/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * POST endpoint for Stripe Billing webhooks (BidBoard's own billing).
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Handle: checkout.session.completed, customer.subscription.updated,
 *       customer.subscription.deleted, invoice.payment_failed.
 * - [ ] Sync companies.plan via lib/stripe.handleSubscriptionEvent.
 * - [ ] Idempotent by event id.
 * - [ ] Downgrade path: excess active projects flip to read-only paused,
 *       nothing deleted, clear in-app notice.
 */

export async function POST(_request: Request): Promise<Response> {
  throw new Error("Not implemented");
}
