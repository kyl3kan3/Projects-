/**
 * The Stripe webhook: verify, claim, handle — no business logic inline.
 *
 * Signature verification is mandatory. An unsigned request that can mark a deposit
 * paid is a way for anyone who finds this URL to tell a contractor they have money
 * they do not have.
 *
 * Both platform events (our subscriptions) and connected-account events (a
 * homeowner paying a deposit) arrive here; `src/lib/billing.ts` tells them apart by
 * the `account` field on the envelope.
 */

import type { NextRequest } from "next/server";
import { claimEvent, handleStripeEvent, markEventProcessed } from "@/lib/billing";
import { verifyWebhook, webhookConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";
// Verification needs the exact bytes Stripe signed.
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  if (!webhookConfigured()) {
    return Response.json(
      { error: "STRIPE_WEBHOOK_SECRET is not set; refusing to process webhooks." },
      { status: 503 },
    );
  }
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
    await markEventProcessed(event.id);
  } catch (err) {
    // 500 so Stripe retries. Losing a deposit event silently would leave a
    // homeowner who has paid looking at an unpaid proposal.
    console.error(`[stripe] handling ${event.type} failed`, err);
    await markEventProcessed(event.id, err instanceof Error ? err.message : "unknown error");
    return new Response("handler error", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
