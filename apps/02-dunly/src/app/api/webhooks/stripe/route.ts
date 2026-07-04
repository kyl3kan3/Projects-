import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { queue } from "@/lib/queue";
import { stripe } from "@/lib/stripe";

/**
 * Connect webhook endpoint — one URL for all connected accounts.
 * Verify, persist (idempotent on event id), enqueue, ack fast.
 * No business logic inline.
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const inserted = await db
    .insert(schema.webhookEvents)
    .values({
      stripeAccountId: event.account ?? null,
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: schema.webhookEvents.stripeEventId })
    .returning({ id: schema.webhookEvents.id });

  // Duplicate delivery: already have it — ack and stop.
  if (inserted.length === 0) return NextResponse.json({ received: true, duplicate: true });

  await queue("events").add("process-webhook", { webhookEventId: inserted[0].id });
  return NextResponse.json({ received: true });
}
