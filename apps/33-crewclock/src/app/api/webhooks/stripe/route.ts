/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * Stripe webhook endpoint for CrewClock's own billing. Verify, persist,
 * ack fast -- side effects run through the queue, never inline.
 *
 * TODO:
 * - [ ] Verify signature with STRIPE_WEBHOOK_SECRET (raw body, not
 *       parsed JSON).
 * - [ ] Insert into webhook_events with stripe_event_id unique
 *       constraint; duplicate delivery -> ack 200 and stop (idempotency).
 * - [ ] Handle: checkout.session.completed (activate org plan),
 *       invoice.created (apply the $49 floor line item via
 *       src/lib/stripe.applyMonthlyFloor), customer.subscription.updated
 *       (seat/plan changes), customer.subscription.deleted (downgrade to
 *       read-only, retain data).
 * - [ ] Return 200 in under a second; enqueue anything slower.
 * - [ ] Unhandled event types: persist, ack, ignore.
 */

export async function POST(_request: Request): Promise<Response> {
  throw new Error("Not implemented");
}
