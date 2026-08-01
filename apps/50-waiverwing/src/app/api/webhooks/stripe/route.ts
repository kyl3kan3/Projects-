/**
 * Stripe webhook: verify, claim, apply, ack. Thin by design — the plan logic
 * lives in lib/stripe.
 *
 * The signature is over the raw bytes, so the body is read as text before
 * anything parses it. Redeliveries are absorbed by a unique index on
 * stripe_event_id rather than by hoping Stripe never sends one twice.
 */

import { NextResponse } from "next/server";
import { claimEvent, handleStripeEvent, releaseEvent, stripe } from "@/lib/stripe";
import { env, stripeConfigured } from "@/lib/env";

export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();

  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] signature verification failed", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const claimed = await claimEvent(event);
  if (!claimed) {
    // Already processed. Ack so Stripe stops retrying.
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error(`[stripe] handling ${event.type} failed`, err);
    // Give the claim back, or the retry would be swallowed as a duplicate and
    // the account would sit on the wrong plan forever. Claiming is how we avoid
    // double-processing; it must not become how we avoid processing at all.
    await releaseEvent(event.id);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
