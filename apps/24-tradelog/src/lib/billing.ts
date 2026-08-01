/**
 * Stripe billing: Checkout to upgrade, the Billing Portal for everything else,
 * and a webhook that is the only thing allowed to change a user's plan.
 *
 * Downgrade rule: **nothing is deleted.** A trader whose card expires keeps every
 * execution, trade, note and screenshot; what they lose is access to the features
 * above their tier. Deleting someone's trading history because a payment failed
 * would be unforgivable in a product sold on being the honest record.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions, users, type PlanId, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { planForPrice, type BillingInterval } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "TradeLog", url: "https://tradelog.app" },
    });
  }
  return _stripe;
}

function priceIdFor(planId: Exclude<PlanId, "free">, interval: BillingInterval): string {
  const prices = env.stripePrices;
  const id =
    planId === "pro"
      ? interval === "year"
        ? prices.proYearly
        : prices.proMonthly
      : interval === "year"
        ? prices.traderYearly
        : prices.traderMonthly;
  if (!id) throw new Error(`No Stripe price configured for ${planId} billed by ${interval}`);
  return id;
}

async function ensureCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    metadata: { userId: user.id },
  });
  await getDb().update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
  return customer.id;
}

export async function createCheckoutSession(
  user: User,
  planId: Exclude<PlanId, "free">,
  interval: BillingInterval,
): Promise<string> {
  const customerId = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(planId, interval), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id, plan: planId, interval },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(user: User): Promise<string> {
  const customerId = await ensureCustomer(user);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* --------------------------------------------------------------- webhook --- */

const HANDLED = new Set<Stripe.Event["type"]>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (!HANDLED.has(event.type)) return;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      await syncSubscription(await stripe().subscriptions.retrieve(session.subscription));
    }
    return;
  }

  await syncSubscription(event.data.object as Stripe.Subscription);
}

async function userIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.userId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId));
  return user?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await userIdForSubscription(sub);
  if (!userId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable user`);
    return;
  }

  const item = sub.items.data[0];
  const priceId = item?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const resolved = planForPrice(priceId, env.stripePrices);
  const target: PlanId = active ? resolved.plan : "free";

  // Stripe moved the period end onto the subscription item; read either shape.
  const periodEndSeconds =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    null;
  const periodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;

  const db = getDb();
  const row = {
    userId,
    stripeSubscriptionId: sub.id,
    priceId,
    plan: target,
    status: sub.status,
    interval: resolved.interval,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };

  await db
    .insert(subscriptions)
    .values(row)
    .onConflictDoUpdate({ target: subscriptions.userId, set: row });

  // The only write that changes a plan. Nothing is deleted on a downgrade.
  await db.update(users).set({ plan: target }).where(eq(users.id, userId));
}

export async function getSubscription(userId: string) {
  const [row] = await getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId));
  return row ?? null;
}
