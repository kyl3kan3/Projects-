/**
 * POST /api/webhooks/stripe
 *
 * The law, and there is no business logic in here: verify the signature →
 * insert into `webhook_events` keyed by the Stripe event id (a duplicate is
 * acked and dropped) → enqueue `process-stripe-event` → 200 fast.
 *
 * Plan state is applied by the worker from the persisted row, so a Stripe retry
 * cannot double-apply and an event that arrives while the database is busy is
 * not lost.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb } from "@/db";
import { webhookEvents } from "@/db/schema";
import { env, features } from "@/lib/env";
import { stripe } from "@/lib/billing";
import { enqueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!features.stripe || !env.stripeWebhookSecret) {
    return NextResponse.json({ error: "Billing is not configured here." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature." }, { status: 400 });

  // The raw body, byte for byte — a parsed-and-restringified body will not verify.
  const raw = await request.text();

  let event: Stripe.Event;
  try {
    const client = await stripe();
    event = client.webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unreadable";
    return NextResponse.json({ error: `Signature check failed: ${message}` }, { status: 400 });
  }

  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: webhookEvents.externalId })
    .returning({ id: webhookEvents.id });

  // Already seen: ack and stop. No enqueue, no work.
  if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });

  await enqueue("process-stripe-event", { webhookEventId: inserted[0].id }, { jobId: `stripe:${event.id}` });
  return NextResponse.json({ received: true });
}
