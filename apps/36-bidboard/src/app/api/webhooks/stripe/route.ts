import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { env } from "@/lib/env";
import { applySubscriptionSync, readSubscriptionEvent, stripe } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * Stripe subscription webhooks. The raw body is required for the signature check, so
 * this reads text, never json.
 *
 * Unexercised in this environment: there is no Stripe key here, so the signature
 * verification below has never run against a real event. The mapping it feeds
 * (`readSubscriptionEvent`) is pure and covered by tests.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    console.error("[stripe] signature check failed", err);
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await applySubscriptionSync(
        readSubscriptionEvent({
          id: subscription.id,
          status: subscription.status,
          metadata: subscription.metadata,
          items: subscription.items as never,
          cancel_at_period_end: subscription.cancel_at_period_end,
        }),
      );
      break;
    }
    default:
      // Everything else is noise for this product; acknowledge and move on.
      break;
  }

  return NextResponse.json({ received: true });
}
