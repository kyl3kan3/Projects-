/**
 * Stripe webhook. The only thing allowed to change a plan or credit an invoice.
 *
 * Signature verification is mandatory: an unsigned request that can mark an
 * invoice paid is a free service for anyone who finds the URL.
 */

import type { NextRequest } from "next/server";
import { handleStripeEvent, stripe } from "@/lib/billing";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
// Verification needs the exact bytes Stripe signed.
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  const payload = await req.text();

  let event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return new Response("invalid signature", { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    // 500 so Stripe retries: losing a payment event silently would leave a
    // client who has paid looking at an unpaid invoice and getting chased for it.
    console.error(`[stripe] handling ${event.type} failed`, err);
    return new Response("handler error", { status: 500 });
  }

  return new Response(null, { status: 204 });
}
