/**
 * POST /api/webhooks/stripe
 *
 * The law (ARCHITECTURE.md §6): verify the signature → insert `webhook_events` by
 * event id (a duplicate is an ack and a stop) → enqueue `process-stripe-event` →
 * 200 fast. No plan change happens inline, so a retried delivery or a slow
 * database can never turn into a double downgrade.
 *
 * With no queue configured the event is processed inline *after* the ledger row
 * exists, which keeps the idempotency guarantee identical either way — the row is
 * the lock, not the queue.
 */

import { HANDLED_EVENTS, processWebhookEvent, recordWebhookEvent, stripe } from "@/lib/billing";
import { env, stripeConfigured } from "@/lib/env";
import { QUEUE_NAMES, enqueue } from "@/lib/queue";

export async function POST(request: Request): Promise<Response> {
  if (!stripeConfigured()) {
    // Refuse rather than accept-and-drop: a webhook that 200s while doing
    // nothing is how a billing bug hides for a month.
    return new Response("Stripe is not configured on this deployment", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature", { status: 400 });

  const body = await request.text();
  let event: { id: string; type: string; data: { object: unknown } };
  try {
    const sdk = await stripe();
    event = sdk.webhooks.constructEvent(body, signature, env.stripeWebhookSecret) as typeof event;
  } catch (err) {
    return new Response(
      `Signature verification failed: ${err instanceof Error ? err.message : "unknown"}`,
      { status: 400 },
    );
  }

  if (!HANDLED_EVENTS.has(event.type)) {
    // Ack unknown types so Stripe stops retrying them.
    return Response.json({ received: true, ignored: event.type });
  }

  const isNew = await recordWebhookEvent(event);
  if (!isNew) return Response.json({ received: true, duplicate: true });

  const queued = await enqueue(
    QUEUE_NAMES.processStripeEvent,
    { webhookEventId: event.id },
    { jobId: `stripe:${event.id}` },
  );
  if (!queued) {
    try {
      await processWebhookEvent(event.id);
    } catch (err) {
      // The ledger row is written, so a retry from Stripe is treated as a
      // duplicate. Log loudly rather than pretending it worked.
      console.error(`[stripe] inline processing of ${event.id} failed:`, err);
      return new Response("Recorded but not applied", { status: 500 });
    }
  }

  return Response.json({ received: true, queued });
}
