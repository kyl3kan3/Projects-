/**
 * POST /api/webhooks/stripe
 *
 * The law, followed literally: **verify → insert `webhook_events` by event id
 * (duplicate = ack and stop) → enqueue → 200 fast.** No business logic runs here.
 *
 * Two signing secrets are tried, platform first and then Connect, because both
 * kinds of event arrive on this one path and a Connect event signed with the
 * account secret must not be rejected as a forgery.
 *
 * When there is no queue (Vercel), the stored event is handled inline *after* the
 * insert — still idempotent, because `handleStripeEvent` only writes absolute
 * values derived from the event.
 */

import type { NextRequest } from "next/server";
import { handleStripeEvent, recordWebhookEvent } from "@/lib/billing";
import { env } from "@/lib/env";
import { enqueue, QUEUES } from "@/lib/queue";
import { hasQueue } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Verified {
  id: string;
  type: string;
  payload: unknown;
}

async function verify(body: string, signature: string): Promise<Verified | null> {
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.stripeSecretKey);
  const secrets = [env.stripeWebhookSecret, env.stripeConnectWebhookSecret].filter(Boolean);
  for (const secret of secrets) {
    try {
      const event = stripe.webhooks.constructEvent(body, signature, secret);
      return { id: event.id, type: event.type, payload: event };
    } catch {
      // Try the next secret; a Connect event is signed with the other one.
    }
  }
  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Refusing is the honest answer: without the secret nothing can be verified,
    // and an unverified webhook that mutates plans is a way to give away the app.
    return Response.json(
      { error: "Stripe is not configured on this deployment" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const body = await request.text();
  const event = await verify(body, signature);
  if (!event) return Response.json({ error: "bad signature" }, { status: 400 });

  const fresh = await recordWebhookEvent(event);
  if (!fresh) return Response.json({ ok: true, duplicate: true });

  if (hasQueue()) {
    await enqueue(QUEUES.processStripeEvent, { externalId: event.id });
  } else {
    // No worker on this deployment: handle it inline, after the insert.
    try {
      await handleStripeEvent(event.id);
    } catch (err) {
      // Ack anyway. The event is stored; a retry would insert a duplicate and stop.
      console.error("[webhook] inline handling failed", { id: event.id, err });
    }
  }

  return Response.json({ ok: true });
}
