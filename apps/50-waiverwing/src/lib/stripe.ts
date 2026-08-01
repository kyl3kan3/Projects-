/**
 * Stripe Billing: three plans, a 14-day trial, and volume soft-caps.
 *
 * Nothing in this file is ever called by the signing path. Volume caps drive
 * banners and upgrade prompts and nothing else — a waiver blocked at a busy
 * counter because a card expired is the one unforgivable failure, so the
 * capability simply is not there to block it.
 *
 * The webhook is the only thing allowed to change `accounts.plan`.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, webhookEvents, type Account, type Plan } from "@/db/schema";
import { env } from "@/lib/env";
import { planForPrice, PLANS } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    // Pinned, never "latest": an API version that moves under a running app is
    // a webhook shape that changes without a deploy.
    _stripe = new Stripe(env.stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "WaiverWing", url: "https://waiverwing.com" },
    });
  }
  return _stripe;
}

function priceFor(planId: Plan, interval: "monthly" | "annual"): string {
  const id = env.stripePrices[planId];
  if (!id) throw new Error(`No Stripe price configured for the ${PLANS[planId].name} plan`);
  // Annual pricing lives on its own price in Stripe; the env var holds the
  // monthly one and the annual is derived by convention (…_annual suffix).
  return interval === "annual" ? `${id}_annual` : id;
}

async function ensureCustomer(account: Account, email: string): Promise<string> {
  if (account.stripeCustomerId) return account.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: account.name,
    metadata: { accountId: account.id },
  });
  const db = getDb();
  await db
    .update(accounts)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  return customer.id;
}

export async function createCheckoutSession(
  account: Account,
  email: string,
  planId: Plan,
  interval: "monthly" | "annual" = "monthly",
): Promise<string> {
  const customerId = await ensureCustomer(account, email);
  const trialDaysLeft = account.trialEndsAt
    ? Math.max(0, Math.ceil((account.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : 0;

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId, interval), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { accountId: account.id, plan: planId },
      ...(trialDaysLeft > 0 ? { trial_period_days: trialDaysLeft } : {}),
    },
    metadata: { accountId: account.id, plan: planId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createBillingPortalSession(
  account: Account,
  email: string,
): Promise<string> {
  const customerId = await ensureCustomer(account, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* ----------------------------------------------------------------- webhook */

const HANDLED = new Set<string>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Record the event and report whether this process should act on it.
 * The unique index on stripe_event_id makes a redelivery a no-op.
 */
export async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(webhookEvents)
    .values({
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: webhookEvents.stripeEventId })
    .returning({ id: webhookEvents.id });
  return rows.length > 0;
}

/**
 * Give a claim back after a failed handler, so Stripe's retry is processed
 * instead of being mistaken for a redelivery of work that already succeeded.
 */
export async function releaseEvent(stripeEventId: string): Promise<void> {
  const db = getDb();
  await db.delete(webhookEvents).where(eq(webhookEvents.stripeEventId, stripeEventId));
}

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

async function accountIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.accountId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.stripeCustomerId, customerId));
  return account?.id ?? null;
}

/**
 * Apply a subscription to an account.
 *
 * A lapsed subscription drops the plan to Counter — the cheapest paid tier — and
 * never deletes or hides anything. The signed-waiver archive is a legal record
 * with multi-year retention (README); losing it because a card expired would be
 * indefensible, so downgrade only affects features and caps.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const accountId = await accountIdForSubscription(sub);
  if (!accountId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable account`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const mapped = planForPrice(priceId?.replace(/_annual$/, "") ?? null, env.stripePrices);
  const target: Plan = active ? (mapped ?? "counter") : "counter";

  const db = getDb();
  await db
    .update(accounts)
    .set({
      plan: target,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      // A real subscription supersedes the signup trial.
      trialEndsAt: sub.status === "trialing" && sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(accounts.id, accountId));
}

export { softCapState, softCapMessage } from "@/lib/plans";
