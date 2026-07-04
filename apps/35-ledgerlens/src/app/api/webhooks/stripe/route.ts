/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * POST endpoint for Stripe Billing webhooks (LedgerLens's own billing --
 * this app has no Stripe Connect surface).
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Handle: checkout.session.completed, customer.subscription.updated,
 *       customer.subscription.deleted, invoice.payment_failed.
 * - [ ] Sync organizations.plan / stripe_customer_id via
 *       lib/stripe.handleSubscriptionEvent.
 * - [ ] Idempotent by event id (store processed ids or upsert semantics).
 * - [ ] Downgrade path: plan lowered -> caps apply next period, nothing
 *       is deleted, over-cap documents park.
 */

export async function POST(_request: Request): Promise<Response> {
  throw new Error("Not implemented");
}
