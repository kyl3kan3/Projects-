/**
 * Stripe billing: Checkout to subscribe, the Billing Portal for everything else,
 * and a webhook that is the only thing allowed to change a merchant's tier.
 *
 * Downgrade rule: nothing is deleted, ever. A store that drops from Growth to
 * Free keeps its wall widget, its photos, and its imported history — the wall
 * simply falls back to the badge on the storefront until they upgrade again
 * (see widget-data.ts). Deleting a merchant's review history because their card
 * expired would be unforgivable in a product sold on trust.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, subscriptions, type Merchant, type Tier } from "@/db/schema";
import { env } from "@/lib/env";
import { PAID_TIERS, plan, tierForPrice } from "@/lib/plans";
import { startNewPeriod } from "@/lib/metering";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "TrustBadge", url: "https://trustbadge.io" },
    });
  }
  return _stripe;
}

function priceFor(tier: Exclude<Tier, "free">): string {
  const id = env.stripePrices[tier];
  if (!id) throw new Error(`No Stripe price configured for the ${tier} plan`);
  return id;
}

/** Ensure the merchant has a Stripe customer, creating one on first upgrade. */
async function ensureCustomer(merchant: Merchant): Promise<string> {
  if (merchant.stripeCustomerId) return merchant.stripeCustomerId;
  const customer = await stripe().customers.create({
    email: merchant.email,
    name: merchant.name ?? undefined,
    metadata: { merchantId: merchant.id },
  });
  const db = getDb();
  await db
    .update(merchants)
    .set({ stripeCustomerId: customer.id })
    .where(eq(merchants.id, merchant.id));
  return customer.id;
}

export async function createCheckoutSession(
  merchant: Merchant,
  tier: Exclude<Tier, "free">,
): Promise<string> {
  const customerId = await ensureCustomer(merchant);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(tier), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { merchantId: merchant.id } },
    metadata: { merchantId: merchant.id, tier },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(merchant: Merchant): Promise<string> {
  const customerId = await ensureCustomer(merchant);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* ----------------------------------------------------------------- webhook --- */

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

async function merchantIdFor(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.merchantId;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.stripeCustomerId, customerId));
  return merchant?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const merchantId = await merchantIdFor(sub);
  if (!merchantId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable merchant`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  const target: Tier = active ? tierForPrice(priceId, env.stripePrices) : "free";
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
  const periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;

  const db = getDb();
  await db
    .insert(subscriptions)
    .values({
      merchantId,
      stripeSubscriptionId: sub.id,
      priceId,
      tier: target,
      status: sub.status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.merchantId,
      set: {
        stripeSubscriptionId: sub.id,
        priceId,
        tier: target,
        status: sub.status,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  await db.update(merchants).set({ tier: target }).where(eq(merchants.id, merchantId));

  // Stripe's billing period is the meter's period once someone is paying: an
  // upgrade mid-month must not leave them measured against the old window.
  if (periodStart) await startNewPeriod(merchantId, periodStart);
}

export async function getSubscription(merchantId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.merchantId, merchantId));
  return row ?? null;
}

/** The upgrade ladder as the billing screen shows it. */
export function upgradeTargets(current: Tier): Exclude<Tier, "free">[] {
  return PAID_TIERS.filter((t) => plan(t).priceMonthly !== plan(current).priceMonthly);
}
