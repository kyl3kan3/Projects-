/**
 * src/app/api/webhooks/stripe/route.ts
 *
 * One endpoint for both Stripe surfaces: platform events (MatPass's own billing)
 * and connected-account events (family tuition on the school's Stripe).
 *
 * The pipeline is the portfolio's standard one, and the order matters:
 *
 *   verify signature -> insert into webhook_events by event id
 *     -> duplicate? acknowledge and stop
 *     -> apply the event -> 200
 *
 * Applying happens inline rather than through a queue because the deployment
 * target has no worker; `applyStripeEvent` is idempotent and cheap, and the
 * `processed_at` stamp means a retried delivery re-applies nothing.
 *
 * Refuses to run without a signing secret. An endpoint that mutates
 * subscription state on unsigned input is a hole, not a convenience.
 */

import { NextResponse, type NextRequest } from "next/server";
import { applyStripeEvent, persistWebhookEvent } from "@/lib/billing";
import { env, has } from "@/lib/env";
import { stripeClient } from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!has("STRIPE_WEBHOOK_SECRET") && !has("STRIPE_CONNECT_WEBHOOK_SECRET")) {
    return NextResponse.json(
      { error: "no webhook signing secret configured — refusing to process" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  const stripe = await stripeClient();

  // Connected-account events are signed with the Connect endpoint's secret, so
  // both are tried before giving up.
  const secrets = [env.stripeWebhookSecret, env.stripeConnectWebhookSecret].filter(Boolean);
  let event: import("stripe").Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(raw, signature, secret);
      break;
    } catch {
      continue;
    }
  }
  if (!event) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  const stored = await persistWebhookEvent({
    externalId: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
  if (!stored.fresh) {
    // Already seen. Acknowledge so Stripe stops retrying, and change nothing.
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const result = await applyStripeEvent(stored.id);
    return NextResponse.json({ ok: true, applied: result.applied });
  } catch (err) {
    console.error("[stripe webhook] apply failed", err);
    // 500 so Stripe retries; the event row is already stored and the retry will
    // find it unprocessed.
    return NextResponse.json({ error: "could not apply event" }, { status: 500 });
  }
}
