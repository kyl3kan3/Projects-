/**
 * POST /api/webhooks/plaid
 *
 * The law: verify (Plaid JWT via their JWK endpoint) -> insert
 * webhook_events by (provider, event id) (duplicate = ack and stop) ->
 * enqueue process-webhook -> 200 fast. ZERO business logic inline.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
