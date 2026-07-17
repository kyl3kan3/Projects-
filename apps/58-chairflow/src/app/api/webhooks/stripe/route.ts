/**
 * POST /api/webhooks/stripe
 *
 * ONE route, TWO signatures: platform (Billing) events verify against
 * STRIPE_WEBHOOK_SECRET; Connect events against
 * STRIPE_CONNECT_WEBHOOK_SECRET (try platform first, fall through).
 *
 * The law: verify signature -> insert webhook_events by (provider,
 * event id) (duplicate = ack 200 and stop) -> enqueue
 * process-stripe-event -> ack fast. ZERO business logic inline.
 *
 * TODO:
 * - [ ] Raw-body constructEvent (export const dynamic = "force-dynamic").
 * - [ ] onConflictDoNothing insert; when ignored, 200 without enqueue.
 * - [ ] Events of interest: checkout.session.completed,
 *       customer.subscription.updated|deleted, invoice.payment_failed,
 *       account.updated (connect status), payment_intent.succeeded|
 *       payment_failed (fee captures), charge.dispute.created.
 */

export async function POST(request: Request): Promise<Response> {
  void request;
  return new Response("Not implemented", { status: 501 });
}
