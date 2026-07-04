/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint: rent payment events on connected accounts and
 * TenantFile's own subscription lifecycle. Verify, persist, enqueue — no
 * business logic inline.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body).
 * - [ ] Idempotency: unique event id, duplicate -> ack 200 and stop.
 * - [ ] payment_intent.succeeded / .processing (ACH!) on connected
 *       accounts: enqueue ledger settlement (ACH settles days later —
 *       show "processing" honestly, mark paid only on success).
 * - [ ] payment_intent.payment_failed: notify landlord + tenant, ledger
 *       stays due.
 * - [ ] checkout.session.completed / customer.subscription.* (platform):
 *       update landlords.plan.
 * - [ ] Return 200 in <1s; failures -> Sentry + Stripe retry.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 3
  return new Response("Not implemented", { status: 501 });
}
