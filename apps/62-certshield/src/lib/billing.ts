/**
 * src/lib/billing.ts
 *
 * Stripe Billing: Checkout to subscribe, the Billing Portal for everything else,
 * and a webhook that is the only thing allowed to change an org's plan.
 *
 * Downgrade rule: nothing is deleted and no certificate stops being tracked. A
 * plan that no longer covers the vendor count blocks *adding* vendors and says so
 * (lib/plans.ts). Deleting a customer's insurance file because their card expired
 * would be indefensible for a product sold on liability protection.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { orgs, webhookEvents, type Org, type PlanId } from "@/db/schema";
import { env } from "@/lib/env";
import { appendAudit } from "@/lib/audit";
import { planForPrice, TRIAL_DAYS } from "@/lib/plans";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "CertShield", url: "https://certshield.app" },
    });
  }
  return _stripe;
}

function priceFor(plan: Exclude<PlanId, "trial">): string {
  const prices = env.stripePrices;
  const id = prices[plan];
  if (!id) throw new Error(`No Stripe price is configured for the ${plan} plan.`);
  return id;
}

async function ensureCustomer(org: Org, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: org.name,
    metadata: { orgId: org.id },
  });
  const db = getDb();
  await db
    .update(orgs)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(orgs.id, org.id));
  return customer.id;
}

export async function createCheckoutSession(
  org: Org,
  email: string,
  plan: Exclude<PlanId, "trial">,
): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(plan), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?subscribed=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { orgId: org.id } },
    metadata: { orgId: org.id, plan },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
  return session.url;
}

export async function createPortalSession(org: Org, email: string): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/* ------------------------------------------------------------------ webhook */

/**
 * The idempotency ledger. Returns false when this event id has been seen before,
 * which is the webhook's "ack and stop" branch — Stripe retries, and a retry must
 * not re-apply anything.
 */
export async function recordWebhookEvent(event: {
  id: string;
  type: string;
  payload: unknown;
}): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      externalId: event.id,
      type: event.type,
      payload: event.payload as object,
    })
    .onConflictDoNothing({ target: webhookEvents.externalId })
    .returning();
  return Boolean(row);
}

export async function markWebhookProcessed(externalId: string): Promise<void> {
  const db = getDb();
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.externalId, externalId));
}

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

async function orgIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.orgId;
  if (fromMetadata) return fromMetadata;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.stripeCustomerId, customerId));
  return org?.id ?? null;
}

export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const orgId = await orgIdForSubscription(sub);
  if (!orgId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable org`);
    return;
  }
  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  if (!org) return;

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const live = sub.status === "active" || sub.status === "trialing";
  const mapped = planForPrice(priceId, env.stripePrices);
  const target: PlanId = live && mapped ? mapped : "trial";

  // Falling back to `trial` without a trial end would hand out a fresh free run
  // every time a card fails. A cancelled subscription lands on an expired trial,
  // which is read-only — and read-only still exports binders.
  const trialEndsAt =
    target === "trial" ? (org.trialEndsAt ?? new Date(Date.now() - 86_400_000)) : null;

  if (org.plan === target && org.stripeSubscriptionId === sub.id) return;

  await db
    .update(orgs)
    .set({
      plan: target,
      stripeSubscriptionId: sub.id,
      trialEndsAt,
      updatedAt: new Date(),
    })
    .where(eq(orgs.id, org.id));

  await appendAudit({
    orgId: org.id,
    actor: "system (stripe webhook)",
    action: "plan.changed",
    target: `${org.plan} → ${target}`,
    metadata: { subscriptionId: sub.id, status: sub.status, priceId },
  });
}

/** Start (or restart) a trial. Used only by signup; kept here for one owner. */
export function trialEnd(from: Date = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * 86_400_000);
}
