/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint: one-time per-contract purchases, subscription
 * lifecycle, and credit grants. Verify, persist, enqueue — no business
 * logic inline.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Idempotency: unique event id, duplicate -> ack 200 and stop.
 * - [ ] checkout.session.completed (one-time): purchases row (1 credit),
 *       implicit account creation, kick the pending review if an upload
 *       is waiting.
 * - [ ] invoice.paid (subscriptions): monthly credit grant with period
 *       expiry.
 * - [ ] customer.subscription.updated/deleted: accounts.plan changes;
 *       credits ledger untouched (already-granted credits keep their
 *       expiry).
 * - [ ] charge.refunded: revoke unconsumed credits from that purchase.
 * - [ ] Return 200 in <1s; failures -> Sentry + Stripe retry.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 3
  return new Response("Not implemented", { status: 501 });
}
