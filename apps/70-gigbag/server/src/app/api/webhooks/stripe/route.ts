/**
 * POST /api/webhooks/stripe
 *
 * Platform + Connect signatures. The law: verify -> insert
 * webhook_events by (provider, event id) (duplicate = ack and stop)
 * -> enqueue process-webhook -> 200 fast. Deposit success flips
 * deposit_status and confirms the gig — in the worker.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
