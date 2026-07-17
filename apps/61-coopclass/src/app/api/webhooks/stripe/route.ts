/**
 * POST /api/webhooks/stripe
 *
 * Platform + Connect signatures on one route. The law: verify ->
 * insert webhook_events by event id (duplicate = ack and stop) ->
 * enqueue process-stripe-event -> 200 fast. ZERO business logic inline.
 *
 * TODO: raw-body constructEvent; onConflictDoNothing insert; events:
 * checkout.session.completed, invoice.paid / payment_failed (plans),
 * customer.subscription.updated|deleted.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
