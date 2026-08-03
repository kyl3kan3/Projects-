/**
 * Stripe webhook.
 *
 * The signature is verified against the raw body — `request.text()`, never a
 * parsed-and-restringified object, because JSON round-tripping changes the bytes
 * and every signature would fail.
 *
 * Only subscription lifecycle events matter: the plan an organization is on is
 * derived from the live subscription's price, and a subscription that stops being
 * active drops the org back to an expired trial so pushes are refused with an
 * upgrade message rather than silently continuing unpaid.
 */

import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { env } from "@/lib/env";
import { applySubscription, billingConfigured, stripe } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!billingConfigured()) {
    return NextResponse.json({ error: "billing-not-configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing-signature" }, { status: 400 });

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: "invalid-signature", message }, { status: 400 });
  }

  const db = getDb();

  async function organizationForCustomer(customerId: string | null): Promise<string | null> {
    if (!customerId) return null;
    const [org] = await db.select().from(organizations).where(eq(organizations.stripeCustomerId, customerId));
    return org?.id ?? null;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const organizationId =
        session.client_reference_id ?? (await organizationForCustomer(String(session.customer ?? "") || null));
      if (!organizationId) break;
      // Record the customer id even when checkout created it, so the portal and
      // later webhooks can find this organization.
      if (session.customer) {
        await db
          .update(organizations)
          .set({ stripeCustomerId: String(session.customer) })
          .where(eq(organizations.id, organizationId));
      }
      if (session.subscription) {
        const subscription = await stripe().subscriptions.retrieve(String(session.subscription));
        await applySubscription(organizationId, {
          id: subscription.id,
          status: subscription.status,
          priceId: subscription.items.data[0]?.price?.id ?? null,
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const organizationId =
        (subscription.metadata?.organizationId as string | undefined) ??
        (await organizationForCustomer(String(subscription.customer ?? "") || null));
      if (!organizationId) break;
      await applySubscription(organizationId, {
        id: subscription.id,
        // A deleted subscription can still report `active` in the payload; the
        // event type is the authority on whether it is gone.
        status: event.type === "customer.subscription.deleted" ? "canceled" : subscription.status,
        priceId: subscription.items.data[0]?.price?.id ?? null,
      });
      break;
    }
    default:
      // Everything else is acknowledged and ignored: Stripe retries anything we
      // 500 on, and a 500 for an event we do not handle is a self-inflicted loop.
      break;
  }

  return NextResponse.json({ received: true });
}
