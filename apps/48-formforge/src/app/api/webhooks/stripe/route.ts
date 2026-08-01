/**
 * Stripe webhook for FormForge's own billing. Verify, dedupe, apply, ack.
 *
 * The raw body is read before anything parses it, because the signature is over
 * raw bytes. An unknown event type is a 200 — Stripe retries a 500, and retrying
 * something we deliberately ignore is noise for both sides.
 *
 * Nothing here writes patient data, and nothing here logs a request body.
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";
import { applyPatch, applyStripeEvent, stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Event ids seen in this process. Cheap idempotency for retries in a warm lambda. */
const seen = new Set<string>();

export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (seen.has(event.id)) return NextResponse.json({ ok: true, deduped: true });
  seen.add(event.id);
  if (seen.size > 500) seen.clear();

  try {
    const patch = applyStripeEvent(event);
    if (patch) await applyPatch(patch);
  } catch (err) {
    console.error("[stripe] could not apply", event.type, err);
    return NextResponse.json({ error: "Could not apply event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type: event.type });
}
