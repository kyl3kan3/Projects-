/**
 * Stripe webhook for CrewClock's own billing. The only thing allowed to change
 * an organization's plan.
 *
 * Signature verification is mandatory: an unsigned request that could grant a
 * plan is a free upgrade for anyone who finds the URL. Idempotency lives in
 * `handleStripeEvent`, keyed on the unique `stripe_event_id` — which matters
 * here more than usual, because a retried `invoice.created` must not add the
 * $49 floor adjustment twice.
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getStripe, handleStripeEvent } from "@/lib/stripe";

export const dynamic = "force-dynamic";
// Signature verification needs the exact bytes Stripe signed.
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await req.text();

  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // 500 so Stripe retries: losing a subscription event would leave someone
    // paying for a plan they do not have, or the reverse.
    console.error(`[stripe] handling ${event.type} failed`, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
