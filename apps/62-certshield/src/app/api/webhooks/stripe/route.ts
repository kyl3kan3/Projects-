/**
 * POST /api/webhooks/stripe
 *
 * The law: verify the signature → insert `webhook_events` by event id (a duplicate
 * is acked and stopped) → enqueue `process-stripe-event` → 200 fast. No business
 * logic inline.
 *
 * When there is no queue (the Vercel shape), the handler runs inline *after* the
 * ledger insert has already claimed the event, so the idempotency guarantee is the
 * same in both deployments.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  handleStripeEvent,
  markWebhookProcessed,
  recordWebhookEvent,
  stripe,
} from "@/lib/billing";
import { env, stripeConfigured } from "@/lib/env";
import { enqueue, QUEUES } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // Say so plainly rather than failing signature verification for the wrong reason:
  // a 400 "invalid signature" on a deployment with no Stripe keys sends whoever is
  // debugging it looking in exactly the wrong place.
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe is not configured in this deployment." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const isNew = await recordWebhookEvent({ id: event.id, type: event.type, payload: event });
  if (!isNew) {
    // Stripe retries; a retry must not re-apply anything.
    return NextResponse.json({ received: true, duplicate: true });
  }

  const queued = await enqueue(
    QUEUES.processStripeEvent,
    { externalId: event.id },
    { jobId: `stripe:${event.id}` },
  );

  if (!queued) {
    try {
      await handleStripeEvent(event);
      await markWebhookProcessed(event.id);
    } catch (err) {
      // The event is in the ledger unprocessed; Stripe's retry will find the
      // duplicate and stop, so this is logged loudly rather than swallowed.
      console.error("[stripe] inline handling failed for", event.id, err);
      return NextResponse.json({ received: true, processed: false }, { status: 202 });
    }
  }

  return NextResponse.json({ received: true, queued });
}
