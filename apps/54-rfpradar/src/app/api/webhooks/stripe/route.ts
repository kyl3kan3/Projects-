/**
 * POST /api/webhooks/stripe
 *
 * The webhook law, in order and with nothing else in between:
 *
 *   verify signature → insert `webhook_events` by Stripe event id
 *   (duplicate = ack and stop) → enqueue `process-stripe-event` → 200, fast.
 *
 * Zero business logic inline. Plan changes happen in the worker (or the cron
 * tick) from the persisted event, which is what makes a replayed delivery a
 * no-op and a crashed worker recoverable — the ledger row is still there,
 * unprocessed, and the next sweep picks it up.
 *
 * When no queue is configured the enqueue simply returns false and the event
 * waits for `/api/cron/tick`. That is the Vercel shape, not a failure, so the
 * response still acks 200: telling Stripe to retry would be a lie.
 */

import type Stripe from "stripe";
import { getDb } from "@/db";
import { webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";
import { QUEUES, enqueue } from "@/lib/queue";
import { HANDLED_EVENTS, getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  // The RAW body, before any parsing — the signature is over these bytes.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (error) {
    console.error("[stripe] signature verification failed:", error);
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  // Idempotency ledger first. A duplicate delivery loses the insert and stops
  // here, before anything can be applied twice.
  const inserted = await getDb()
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: webhookEvents.externalId })
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    return Response.json({ received: true, duplicate: true });
  }

  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) {
    // Stored for the record, but nothing to do. Marking it processed keeps the
    // pending-events sweep from picking it up on every tick forever.
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.id, inserted[0].id));
    return Response.json({ received: true, ignored: event.type });
  }

  const queued = await enqueue(QUEUES.stripeEvents, "process-stripe-event", {
    webhookEventId: inserted[0].id,
  });

  return Response.json({ received: true, queued });
}
