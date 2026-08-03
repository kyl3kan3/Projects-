/**
 * Stripe Billing webhooks.
 *
 * The raw body is required for signature verification, so it is read as text and never
 * parsed before `constructEvent`. Replays are absorbed by the `webhook_events` primary
 * key: a retried `customer.subscription.deleted` that ran twice would downgrade an org
 * that had already resubscribed.
 */

import { claimEvent, handleSubscriptionEvent, verifyStripeSignature } from "@/lib/billing";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!env.stripeWebhookSecret) {
    return Response.json({ error: "Billing webhooks are not configured." }, { status: 503 });
  }

  const raw = await request.text();
  let event;
  try {
    event = verifyStripeSignature(raw, request.headers.get("stripe-signature"));
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "invalid signature" },
      { status: 400 },
    );
  }

  if (!(await claimEvent(event.id, event.type))) {
    return Response.json({ ok: true, replay: true });
  }

  try {
    await handleSubscriptionEvent(event);
  } catch (err) {
    console.error("[stripe] handler failed", event.type, err);
    // 500 asks Stripe to retry, and the event id claim is what keeps that safe.
    return Response.json({ error: "handler_failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
