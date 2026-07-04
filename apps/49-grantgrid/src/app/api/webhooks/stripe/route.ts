/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint. Verify, apply, ack -- thin by design; plan
 * logic lives in lib/stripe.
 *
 * TODO:
 * - [ ] Read the raw body BEFORE parsing (signature is over raw bytes);
 *       verify with STRIPE_WEBHOOK_SECRET; 400 on mismatch.
 * - [ ] Idempotency: dedupe on event.id before applying.
 * - [ ] Route checkout.session.completed and
 *       customer.subscription.updated|deleted to lib/stripe handlers.
 * - [ ] Unknown event types: ack 200, log at debug.
 */

export async function POST(_req: Request): Promise<Response> {
  throw new Error("Not implemented");
}
