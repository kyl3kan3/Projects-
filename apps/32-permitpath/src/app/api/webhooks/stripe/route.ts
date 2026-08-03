/**
 * Stripe Billing webhook.
 *
 * Verify the signature against the raw body, persist the event keyed on Stripe's
 * own id, then apply it. The unique index on (provider, provider_event_id) is what
 * makes a replayed delivery a no-op: five deliveries of the same event insert once
 * and process once.
 *
 * Unknown event types are persisted and acknowledged. Returning 4xx would make
 * Stripe retry something we simply do not handle.
 */

import type { NextRequest } from "next/server";
import { getStripe, handleStripeEvent } from "@/lib/billing";
import { billingConfigured, env, has } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  if (!billingConfigured() || !has("STRIPE_WEBHOOK_SECRET")) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "missing signature" }, { status: 400 });
  }

  // The raw body, not the parsed JSON: re-serialising changes the bytes the
  // signature was computed over.
  const raw = await req.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] signature verification failed", err);
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event);
    return Response.json(outcome);
  } catch (err) {
    console.error("[stripe] processing failed", err);
    // 500 tells Stripe to retry; the event row keeps the error for triage.
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
