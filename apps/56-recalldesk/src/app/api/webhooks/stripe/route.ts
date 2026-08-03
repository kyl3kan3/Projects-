/**
 * Stripe webhook: verify -> record by event id (duplicate = ack and stop) -> apply
 * -> ack fast (ARCHITECTURE flow 6).
 *
 * Stripe never sees PHI. The only thing crossing this boundary is a subscription's
 * state and the practice id we put in its metadata.
 */

import type Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";
import {
  applySubscription,
  markWebhookProcessed,
  practiceForStripe,
  recordWebhookEvent,
  stripe,
} from "@/server/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  if (!stripeConfigured()) {
    return Response.json({ error: "billing not configured" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  const fresh = await recordWebhookEvent({
    provider: "stripe",
    externalId: event.id,
    type: event.type,
    payload: { id: event.id, type: event.type },
  });
  if (!fresh) return Response.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const practice = await practiceForStripe({
          practiceId: (session.metadata?.practiceId ?? session.client_reference_id) || null,
          customerId: typeof session.customer === "string" ? session.customer : null,
        });
        if (practice && typeof session.subscription === "string") {
          const subscription = await stripe().subscriptions.retrieve(session.subscription);
          const item = subscription.items.data[0];
          await applySubscription({
            practiceId: practice.id,
            subscriptionId: subscription.id,
            status: subscription.status,
            priceId: item?.price?.id ?? null,
            quantity: item?.quantity ?? null,
            planHint: session.metadata?.plan ?? null,
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const practice = await practiceForStripe({
          practiceId: subscription.metadata?.practiceId ?? null,
          customerId: typeof subscription.customer === "string" ? subscription.customer : null,
        });
        if (practice) {
          const item = subscription.items.data[0];
          await applySubscription({
            practiceId: practice.id,
            subscriptionId: subscription.id,
            status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
            priceId: item?.price?.id ?? null,
            quantity: item?.quantity ?? null,
            planHint: subscription.metadata?.plan ?? null,
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const practice = await practiceForStripe({
          customerId: typeof invoice.customer === "string" ? invoice.customer : null,
        });
        // Sending pauses via `sendingAllowed`; the roster and ledger stay readable.
        if (practice) {
          await applySubscription({
            practiceId: practice.id,
            subscriptionId: practice.stripeSubscriptionId ?? "",
            status: "past_due",
          });
        }
        break;
      }
      default:
        break;
    }
    await markWebhookProcessed("stripe", event.id);
  } catch {
    // Recorded but not applied: Stripe retries, and the unique index makes the
    // retry safe. Returning 500 is the correct signal for that.
    return Response.json({ error: "processing failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}
