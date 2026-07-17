/**
 * POST /api/webhooks/stripe
 *
 * The law: verify signature -> insert webhook_events by event id
 * (duplicate = ack and stop) -> enqueue process-stripe-event -> 200
 * fast. ZERO business logic inline.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
