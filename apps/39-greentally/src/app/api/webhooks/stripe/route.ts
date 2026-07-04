/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe Billing webhook endpoint: verify, persist, apply plan changes.
 *
 * TODO:
 * - [ ] Signature verification (STRIPE_WEBHOOK_SECRET); 400 on failure.
 * - [ ] Idempotent handling keyed on event id.
 * - [ ] checkout.session.completed / customer.subscription.updated|deleted
 *       -> organizations.plan transitions + gating side effects.
 * - [ ] Ack in <1s; no heavy work inline.
 */

export async function POST(_req: Request): Promise<Response> {
  throw new Error("Not implemented");
}
