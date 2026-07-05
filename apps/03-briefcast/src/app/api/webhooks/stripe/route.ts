import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";

/** Billing webhooks: sync plan + seat + status; past-due gates bots, not data. */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "No signature" }, { status: 400 });
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, env.stripeWebhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const orgId = sub.metadata.orgId;
    const plan = (sub.metadata.plan as "starter" | "pro" | "business" | undefined) ?? "pro";
    if (orgId) {
      const statusMap: Record<string, "trialing" | "active" | "past_due" | "canceled"> = {
        trialing: "trialing",
        active: "active",
        past_due: "past_due",
        unpaid: "past_due",
        canceled: "canceled",
      };
      const status = statusMap[sub.status] ?? "canceled";
      const existing = await db.query.subscriptions.findFirst({ where: eq(schema.subscriptions.orgId, orgId) });
      const values = {
        orgId,
        stripeSubscriptionId: sub.id,
        plan,
        seatCount: sub.items.data[0]?.quantity ?? 1,
        status,
      };
      if (existing) {
        await db.update(schema.subscriptions).set(values).where(eq(schema.subscriptions.id, existing.id));
      } else {
        await db.insert(schema.subscriptions).values(values);
      }
      await db
        .update(schema.organizations)
        .set({ plan: status === "active" || status === "trialing" ? plan : "trial" })
        .where(eq(schema.organizations.id, orgId));
    }
  }

  return NextResponse.json({ received: true });
}
