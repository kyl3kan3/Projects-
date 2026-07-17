/**
 * POST /api/webhooks/stripe
 *
 * Platform (Billing) + Connect signatures on one route (try platform
 * secret first, fall through to connect secret).
 *
 * The law: verify signature -> insert webhook_events by event id
 * (duplicate = ack and stop) -> enqueue process-stripe-event -> 200
 * fast. ZERO business logic inline.
 *
 * TODO: raw-body constructEvent; onConflictDoNothing insert; events of
 * interest include payment_intent.amount_capturable_updated (hold
 * placed), payment_intent.canceled (released), charge.captured.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
