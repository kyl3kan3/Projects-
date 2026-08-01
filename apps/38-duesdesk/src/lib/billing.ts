/**
 * DuesDesk's own subscription. The webhook is the only thing allowed to change
 * an association's plan.
 *
 * The downgrade rule matters more here than in most products: an association's
 * ledger, roster, and issue history are its institutional memory. Losing units
 * or invoices because a card expired would be unforgivable, so a downgrade
 * **never** deletes or hides anything. Over-limit associations keep working and
 * see an upgrade prompt; the only thing a lower plan withholds is a feature
 * (SMS, documents, exports), never their own records.
 */

import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { associations, subscriptions, type Plan as PlanId } from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { env } from "@/lib/env";
import { planForPrice } from "@/lib/plans";
import { stripe } from "@/lib/stripe";

const HANDLED = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export function handlesPlatformEvent(type: string): boolean {
  return HANDLED.has(type);
}

export async function handlePlatformEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await syncSubscription(sub);
    }
    return;
  }

  await syncSubscription(event.data.object as Stripe.Subscription);
}

async function associationIdFor(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.associationId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const [row] = await getDb()
    .select()
    .from(associations)
    .where(eq(associations.stripeCustomerId, customerId));
  return row?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const associationId = await associationIdFor(sub);
  if (!associationId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable association`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  // No free tier: a lapsed subscription falls back to Block, which is the floor
  // the README commits to, not to nothing.
  const target: PlanId = (active ? planForPrice(priceId, env.stripePrices) : null) ?? "block";

  const periodEndUnix =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items.data[0]?.current_period_end ??
    null;

  const db = getDb();
  await db
    .insert(subscriptions)
    .values({
      associationId,
      stripeSubscriptionId: sub.id,
      priceId,
      plan: target,
      status: sub.status,
      currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.associationId,
      set: {
        stripeSubscriptionId: sub.id,
        priceId,
        plan: target,
        status: sub.status,
        currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  const [before] = await db.select().from(associations).where(eq(associations.id, associationId));
  if (before && before.plan !== target) {
    await db.update(associations).set({ plan: target }).where(eq(associations.id, associationId));
    await audit(associationId, SYSTEM, "changed_plan", `${before.plan} → ${target}`, {
      subscriptionId: sub.id,
      status: sub.status,
    });
  }
}

export async function getSubscription(associationId: string) {
  const [row] = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.associationId, associationId));
  return row ?? null;
}
