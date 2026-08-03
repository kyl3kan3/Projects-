/**
 * Stripe webhooks for SafetyDeck's own billing.
 *
 * Signature-verified against the raw body, which is why this path is outside the
 * middleware matcher — Stripe sends no cookie. Every handler sets state from the
 * event's contents rather than incrementing anything, so a replayed event is a
 * no-op.
 *
 * The cancellation branch is the one that matters: it flips the account to
 * read-only and preserves every record. Deleting a customer's injury log because
 * their card expired would destroy the thing they are legally required to keep.
 */

import { handleSubscriptionEvent, verifyWebhook } from "@/lib/billing";
import { has } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!has("STRIPE_WEBHOOK_SECRET") || !has("STRIPE_SECRET_KEY")) {
    return Response.json({ error: "Billing is not configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = await verifyWebhook(raw, signature);
  } catch (err) {
    console.warn("[stripe] signature verification failed", err);
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const outcome = await handleSubscriptionEvent(event);
    return Response.json({ received: true, outcome });
  } catch (err) {
    console.error("[stripe] handler failed", event.type, err);
    // 500 so Stripe retries: a dropped subscription event leaves a paying
    // customer looking cancelled.
    return Response.json({ error: "Handler failed" }, { status: 500 });
  }
}
