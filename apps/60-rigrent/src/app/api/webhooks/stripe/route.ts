/**
 * POST /api/webhooks/stripe
 *
 * Both signatures on one route: the platform secret (RigRent's own Billing) and
 * the Connect secret (operator deposit holds). The platform secret is tried
 * first, the Connect one second.
 *
 * The law, followed literally: **verify signature → insert `webhook_events` by
 * event id (a duplicate is acked and stopped) → enqueue → ack fast.** No business
 * logic runs inside this request. Stripe retries anything slow, and a handler that
 * does work before acking gets the same event three times.
 *
 * When Redis is configured the enqueue is real; when it is not, the event sits in
 * the ledger with `processed_at` null and `/api/cron/tick` drains it. Either way
 * the ack is immediate and the work is idempotent.
 */

import type { NextRequest } from "next/server";
import { recordWebhookEvent } from "@/lib/billing";
import { env } from "@/lib/env";
import { enqueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface VerifiedEvent {
  id: string;
  type: string;
  payload: unknown;
}

async function verify(raw: string, signature: string): Promise<VerifiedEvent | null> {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey);
  for (const secret of [env.stripeWebhookSecret, env.stripeConnectWebhookSecret]) {
    if (!secret) continue;
    try {
      const event = stripe.webhooks.constructEvent(raw, signature, secret);
      return { id: event.id, type: event.type, payload: event };
    } catch {
      // Wrong secret for this event; try the other one.
    }
  }
  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing stripe-signature.", { status: 400 });
  if (!process.env.STRIPE_SECRET_KEY) {
    return new Response("Stripe is not configured on this deployment.", { status: 503 });
  }
  if (!env.stripeWebhookSecret && !env.stripeConnectWebhookSecret) {
    return new Response("No webhook signing secret is configured.", { status: 503 });
  }

  const raw = await request.text();
  const event = await verify(raw, signature);
  if (!event) return new Response("Signature verification failed.", { status: 400 });

  const inserted = await recordWebhookEvent(event);
  if (!inserted) {
    // Already have it. Ack and stop — this is what idempotency looks like.
    return Response.json({ received: true, duplicate: true });
  }

  await enqueue("process-stripe-event", { externalId: event.id });
  return Response.json({ received: true });
}
