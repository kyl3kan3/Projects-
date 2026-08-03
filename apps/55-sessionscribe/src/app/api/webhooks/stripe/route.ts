/**
 * Stripe webhooks: verify -> persist by event id (duplicate = ack and stop) ->
 * apply plan state -> ack. Stripe never sees PHI, and nothing in this route
 * touches a note.
 */

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import {
  applyStripeEvent,
  HANDLED_EVENTS,
  markWebhookProcessed,
  recordWebhookEvent,
  stripe,
} from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await req.text();
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  // The ledger is the idempotency boundary: a replayed event stops here.
  const fresh = await recordWebhookEvent(event);
  if (!fresh) return NextResponse.json({ ok: true, duplicate: true });

  if (!HANDLED_EVENTS.has(event.type)) {
    await markWebhookProcessed(event.id);
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  try {
    await applyStripeEvent(event);
    await markWebhookProcessed(event.id);
  } catch (err) {
    // Leave processed_at null so a Stripe retry picks it up again.
    console.error(`[stripe] could not apply ${event.type}`, err);
    return NextResponse.json({ error: "Apply failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
