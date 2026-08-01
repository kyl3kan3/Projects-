/**
 * Stripe billing: Checkout to subscribe, the Billing Portal for everything else,
 * and a webhook that is the only thing allowed to change an org's plan.
 *
 * Downgrade rule: databases beyond the new limit are *disabled*, never deleted,
 * and their policies are clamped rather than dropped. Losing someone's backup
 * configuration because a card expired would be indefensible in a product sold
 * on trust — and re-enabling is one click when they pay again.
 */

import Stripe from "stripe";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupPolicies,
  databaseConnections,
  organizations,
  subscriptions,
  type Organization,
  type PlanId,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { plan, planForPrice } from "@/lib/plans";
import { reconcilePoliciesToPlan } from "@/lib/policies";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      appInfo: { name: "VaultBack", url: "https://vaultback.dev" },
    });
  }
  return _stripe;
}

function priceFor(planId: PlanId): string {
  const prices = env.stripePrices;
  const id = prices[planId];
  if (!id) throw new Error(`No Stripe price configured for the ${planId} plan`);
  return id;
}

async function ensureCustomer(org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: org.name,
    metadata: { orgId: org.id },
  });
  const db = getDb();
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

export async function createCheckoutSession(
  org: Organization,
  email: string,
  planId: PlanId,
): Promise<string> {
  const customerId = await ensureCustomer(org, email);
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?upgraded=1`,
    cancel_url: `${env.appUrl}/settings/billing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { orgId: org.id } },
    metadata: { orgId: org.id, plan: planId },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return session.url;
}

export async function createPortalSession(org: Organization, email: string): Promise<string> {
  const customerId = await ensureCustomer(org, email);
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

async function orgIdForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = sub.metadata?.orgId;
  if (fromMetadata) return fromMetadata;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const db = getDb();
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId));
  return org?.id ?? null;
}

/**
 * Write the subscription and apply the plan. Idempotent by construction — the
 * upsert is keyed on org, and `applyPlan` is safe to run repeatedly, so a webhook
 * replay changes nothing.
 */
export async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const orgId = await orgIdForSubscription(sub);
  if (!orgId) {
    console.warn(`[billing] subscription ${sub.id} has no resolvable organization`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const active = sub.status === "active" || sub.status === "trialing";
  // A lapsed subscription falls back to the entry tier rather than to nothing:
  // backups keep running at Hobby limits while a payment problem is sorted out.
  const target: PlanId = active ? planForPrice(priceId, env.stripePrices) : "hobby";

  const periodEndSeconds = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;
  const customerId = typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);

  const db = getDb();
  await db
    .insert(subscriptions)
    .values({
      orgId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      priceId,
      plan: target,
      status: sub.status as never,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        priceId,
        plan: target,
        status: sub.status as never,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  await applyPlan(orgId, target);
}

/**
 * Move an org onto a plan and reconcile everything the new limits do not allow.
 * Safe to call repeatedly.
 */
export async function applyPlan(orgId: string, target: PlanId): Promise<void> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return;

  const changed = org.plan !== target;
  await db
    .update(organizations)
    .set({ plan: target, trialEndsAt: null })
    .where(eq(organizations.id, orgId));

  const limits = plan(target);

  // Disable databases beyond the cap, newest first: the oldest connection is the
  // one someone has been relying on longest.
  const active = await db
    .select()
    .from(databaseConnections)
    .where(and(eq(databaseConnections.orgId, orgId), ne(databaseConnections.status, "disabled")))
    .orderBy(desc(databaseConnections.createdAt));

  if (Number.isFinite(limits.databases)) {
    const overflow = active.slice(0, Math.max(0, active.length - limits.databases));
    for (const connection of overflow) {
      await db
        .update(databaseConnections)
        .set({ status: "disabled" })
        .where(eq(databaseConnections.id, connection.id));
      await db
        .update(backupPolicies)
        .set({ enabled: false })
        .where(eq(backupPolicies.databaseConnectionId, connection.id));
    }
  } else {
    // Upgrading to unlimited re-enables what a downgrade disabled.
    await db
      .update(databaseConnections)
      .set({ status: "active" })
      .where(and(eq(databaseConnections.orgId, orgId), eq(databaseConnections.status, "disabled")));
  }

  await reconcilePoliciesToPlan(orgId, target);

  if (changed) {
    await audit({
      orgId,
      action: "plan.changed",
      subjectType: "plan",
      metadata: { plan: target },
    });
  }
}

export async function getSubscription(orgId: string) {
  const db = getDb();
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
  return row ?? null;
}
