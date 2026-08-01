/**
 * Stripe billing: Checkout to upgrade, the Billing Portal for everything else,
 * and a webhook that is the only thing allowed to change a plan.
 *
 * Downgrade rule: nothing is ever deleted. A list over the new cap stops
 * accepting *new* signups and the badge comes back; the signups already
 * collected, their positions and their referral graph are untouched. Losing a
 * founder's list because a card expired would be unforgivable.
 */

import Stripe from "stripe";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { lists, subscriptions, users, type PlanId, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { plan, planForPrice } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "LaunchList", url: "https://launchlist.app" },
    });
  }
  return _stripe;
}

function priceFor(planId: Exclude<PlanId, "free">): string {
  const prices = env.stripePrices;
  const id = planId === "pro" ? prices.pro : prices.growth;
  if (!id) throw new Error(`No Stripe price configured for the ${planId} plan`);
  return id;
}

async function ensureCustomer(user: User): Promise<string> {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id },
  });
  const db = getDb();
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
  return customer.id;
}

export async function createCheckoutSession(
  user: User,
  planId: Exclude<PlanId, "free">,
): Promise<string> {
  const customerId = await ensureCustomer(user);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id, plan: planId },
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
      const sub = await stripe().subscriptions.retrieve(session.subscription);
      await syncSubscription(sub);
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
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.stripeCustomerId, customerId));
  return row?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const userId = await userIdForSubscription(sub);
  if (!userId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable user`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const target: PlanId = active ? planForPrice(priceId, env.stripePrices) : "free";
  const periodEndSeconds = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;

  const db = getDb();
  const values = {
    userId,
    stripeSubscriptionId: sub.id,
    priceId,
    plan: target,
    status: sub.status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    updatedAt: new Date(),
  };
  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.userId, set: values });

  await applyPlan(userId, target);
}

/**
 * Move a founder onto a plan and reconcile what the new limits don't allow.
 * Safe to call repeatedly.
 */
export async function applyPlan(userId: string, target: PlanId): Promise<void> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return;

  await db.update(users).set({ plan: target }).where(eq(users.id, userId));
  const limits = plan(target);

  // The badge is a plan feature, so a downgrade puts it back. Nothing else about
  // a page changes — content, theme, signups and positions are all untouched.
  if (!limits.canHideBadge) {
    await db
      .update(lists)
      .set({ badgeHidden: false })
      .where(and(eq(lists.userId, userId), eq(lists.badgeHidden, true)));
  }

  // A custom domain we can no longer serve is un-verified rather than deleted,
  // so re-upgrading restores it with one click.
  if (!limits.customDomain) {
    await db
      .update(lists)
      .set({ customDomainVerified: false })
      .where(and(eq(lists.userId, userId), eq(lists.customDomainVerified, true)));
  }
}

export async function getSubscription(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  return row ?? null;
}

/** Lists over the new plan's cap, for the honest warning on the billing screen. */
export async function listsOverCap(userId: string): Promise<number> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return 0;
  const cap = plan(user.plan).lists;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(lists)
    .where(and(eq(lists.userId, userId), ne(lists.status, "archived")));
  return Math.max(0, Number(row?.n ?? 0) - cap);
}
