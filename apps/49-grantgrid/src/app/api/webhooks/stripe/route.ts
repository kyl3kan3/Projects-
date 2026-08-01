/**
 * Stripe webhook. Verify, apply, acknowledge — thin by design; the plan mapping
 * lives in lib/billing.
 *
 * The signature is over the raw bytes, so the body is read before anything parses
 * it. Unknown event types are acknowledged with a 200: arguing with Stripe about
 * which events it sends only produces retries.
 *
 * Unexercised in this environment: there is no Stripe credential here, so no
 * signed payload can be produced to test against. The mapping it delegates to
 * (`planFromSubscription`) is pure and covered by tests.
 */

import type Stripe from "stripe";
import { env, has } from "@/lib/env";
import { handleStripeEvent, isHandledEvent, stripe } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Event ids already applied in this process. A real deployment would put this in
 * the database; in-process is enough to stop Stripe's own immediate retries from
 * double-applying, and applying a subscription twice is idempotent anyway.
 */
const seen = new Set<string>();

export async function POST(req: Request): Promise<Response> {
  if (!has("STRIPE_SECRET_KEY") || !has("STRIPE_WEBHOOK_SECRET")) {
    return Response.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  // Raw bytes, before any parsing: the signature is computed over them.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.warn("[stripe] signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  if (seen.has(event.id)) {
    return Response.json({ received: true, duplicate: true });
  }
  seen.add(event.id);
  if (seen.size > 5_000) seen.clear();

  if (!isHandledEvent(event.type)) {
    return Response.json({ received: true, handled: false });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want for a transient failure.
    console.error("[stripe] handler failed", event.type, err);
    return Response.json({ error: "handler failed" }, { status: 500 });
  }

  return Response.json({ received: true, handled: true });
}
