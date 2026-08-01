/**
 * Stripe webhook. Verify, claim, handle — no business logic inline.
 *
 * Signature verification is mandatory: an unsigned request that can mark an
 * invoice paid is a way for anyone who finds the URL to stop a firm chasing them.
 */

import type { NextRequest } from "next/server";
import { claimEvent, handleStripeEvent } from "@/lib/billing";
import { verifyWebhook } from "@/lib/stripe";

export const dynamic = "force-dynamic";
// Verification needs the exact bytes Stripe signed.
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await req.text();

  let event;
  try {
    event = verifyWebhook(payload, signature);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    // Replay tolerance: a retried delivery acks immediately and does nothing.
    const fresh = await claimEvent(event);
    if (!fresh) return new Response(null, { status: 204 });
    await handleStripeEvent(event);
  } catch (err) {
    // 500 so Stripe retries. Losing a payment event silently would leave a
    // client who has paid looking at an unpaid invoice — and being chased for it.
    console.error(`[stripe] handling ${event.type} failed`, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
