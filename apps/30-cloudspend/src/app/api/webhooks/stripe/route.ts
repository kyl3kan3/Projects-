/**
 * Stripe webhooks. The only place a plan changes: a redirect back from Checkout
 * proves the browser came back, not that a payment succeeded.
 */

import type { NextRequest } from "next/server";
import { applySubscriptionEvent, parseStripeEvent } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const rawBody = await req.text();
  const parsed = await parseStripeEvent(rawBody, req.headers.get("stripe-signature"));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const outcome = await applySubscriptionEvent(parsed.event);
  // Always 200 on a verified event: a 4xx makes Stripe retry an event we have
  // deliberately ignored, forever.
  return Response.json({ received: true, ...outcome });
}
