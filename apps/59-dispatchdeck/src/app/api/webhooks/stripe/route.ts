/**
 * POST /api/webhooks/stripe
 *
 * The law: verify signature -> insert webhook_events by event id
 * (duplicate = ack and stop) -> enqueue process-stripe-event -> 200
 * fast. ZERO business logic inline.
 *
 * TODO:
 * - [ ] Raw-body constructEvent (export const dynamic = "force-dynamic").
 * - [ ] onConflictDoNothing insert; when ignored, 200 without enqueue.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
