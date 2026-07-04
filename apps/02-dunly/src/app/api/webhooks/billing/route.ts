import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

/** Webhooks for Dunly's OWN subscription billing (not Connect events). */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeBillingWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const organizationId = sub.metadata.organizationId;
    const plan = sub.metadata.plan as "starter" | "growth" | "scale" | undefined;
    if (organizationId) {
      const active = sub.status === "active" || sub.status === "trialing";
      await db
        .update(schema.organizations)
        .set({
          plan: active && plan ? plan : "trial",
          billingSubscriptionId: sub.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.organizations.id, organizationId));
    }
  }

  return NextResponse.json({ received: true });
}
