/**
 * POST /api/webhooks/stripe
 *
 * The webhook law (MARKETING is loud; this route is quiet):
 *   verify signature -> insert webhook_events by Stripe event id
 *   (duplicate = ack and stop) -> enqueue process-stripe-event -> 200 fast.
 * ZERO business logic inline — plan changes happen in the worker from
 * the persisted event.
 *
 * TODO:
 * - [ ] stripe.webhooks.constructEvent with the RAW request body and
 *       env.stripeWebhookSecret (export const dynamic = "force-dynamic").
 * - [ ] Insert-or-ignore on webhook_events.external_id (onConflictDoNothing;
 *       when ignored, return 200 without enqueueing).
 * - [ ] Enqueue process-stripe-event with the webhook_events row id.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
