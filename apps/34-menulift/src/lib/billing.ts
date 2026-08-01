/**
 * Billing — Stripe, per-location quantity, three tiers.
 *
 * One subscription per organisation: the tier picks the price, the number of
 * active locations is the quantity. That is the whole model, and it maps to
 * Stripe's own primitives so nothing has to be reconciled by hand.
 *
 * Two deliberate choices:
 *
 *  - **A failed payment never takes a menu down.** `past_due` stays entitled
 *    (src/lib/plans.ts) and the dashboard nags. A restaurant losing its menu
 *    mid-service over a declined card would be the worst possible failure mode.
 *  - **The webhook is the only writer of subscription state.** Checkout returning
 *    successfully does not flip the plan; the event does. That way a browser that
 *    never comes back from Stripe cannot leave the account wrong.
 *
 * Without `STRIPE_SECRET_KEY` the product runs in trial-only mode: everything
 * works, checkout says plainly that billing is not configured.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, locations, organizations, type Organization } from "@/db/schema";
import { env, has } from "@/lib/env";
import { PLANS, TRIAL_DAYS, type PlanId, isPlanId, monthlyTotalCents } from "@/lib/plans";

/** Pinned, never "latest": an account-level API upgrade must not change our code. */
const STRIPE_API_VERSION = "2025-03-31.basil";

let _stripe: Stripe | null = null;

export function billingConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      typescript: true,
    });
  }
  return _stripe;
}

/** Active locations = the subscription quantity. */
export async function activeLocationCount(organizationId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.organizationId, organizationId));
  return rows.filter(Boolean).length;
}

export interface CheckoutRequest {
  organizationId: string;
  plan: PlanId;
  email: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Start a checkout for `plan` at the org's current location count.
 *
 * The price id has to exist in the Stripe account; a missing one is reported as
 * a configuration problem naming the variable, not as "something went wrong".
 */
export async function createCheckoutSession(req: CheckoutRequest): Promise<string> {
  if (!billingConfigured()) {
    throw new Error("Billing is not configured on this deployment (STRIPE_SECRET_KEY is unset).");
  }
  const priceId = env.stripePrices[req.plan];
  if (!priceId) {
    throw new Error(
      `No Stripe price configured for the ${PLANS[req.plan].name} plan — set STRIPE_PRICE_${req.plan.toUpperCase()}.`,
    );
  }

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, req.organizationId));
  if (!org) throw new Error("Organisation not found");

  const stripe = getStripe();
  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: req.email,
      name: org.name,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await db
      .update(organizations)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
  }

  const quantity = Math.max(1, await activeLocationCount(org.id));
  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : 0;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    // Carry the remaining trial across rather than restarting or dropping it.
    subscription_data: {
      trial_period_days: trialDaysLeft > 0 ? Math.min(TRIAL_DAYS, trialDaysLeft) : undefined,
      metadata: { organizationId: org.id, plan: req.plan },
    },
    client_reference_id: org.id,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    allow_promotion_codes: true,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(organizationId: string, returnUrl: string): Promise<string> {
  if (!billingConfigured()) {
    throw new Error("Billing is not configured on this deployment (STRIPE_SECRET_KEY is unset).");
  }
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org?.stripeCustomerId) throw new Error("No billing account yet — start a plan first.");
  const session = await getStripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Push the location count to Stripe after a location is added or deactivated.
 *
 * Silent no-op when billing is unconfigured or the org has no subscription —
 * adding a location during a trial must not throw.
 */
export async function syncQuantity(organizationId: string): Promise<number> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return 0;
  const quantity = Math.max(1, await activeLocationCount(organizationId));

  await db
    .update(organizations)
    .set({ locationQuantity: quantity, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));

  if (!billingConfigured() || !org.stripeSubscriptionId) return quantity;

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
  const item = subscription.items.data[0];
  if (!item || item.quantity === quantity) return quantity;
  await stripe.subscriptionItems.update(item.id, { quantity, proration_behavior: "create_prorations" });
  return quantity;
}

/** Map a Stripe subscription status onto ours. */
export function mapStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "none";
  }
}

/** Which of our plans does this subscription's price correspond to? */
export function planFromSubscription(subscription: Stripe.Subscription): PlanId | null {
  const metadataPlan = subscription.metadata?.plan;
  if (isPlanId(metadataPlan)) return metadataPlan;
  const priceId = subscription.items.data[0]?.price?.id;
  if (!priceId) return null;
  const prices = env.stripePrices;
  for (const id of ["menu", "kitchen", "margin"] as PlanId[]) {
    if (prices[id] && prices[id] === priceId) return id;
  }
  return null;
}

/** Apply a subscription to an organisation. Called only from the webhook. */
export async function applySubscription(
  organizationId: string,
  subscription: Stripe.Subscription,
): Promise<void> {
  const db = getDb();
  const plan = planFromSubscription(subscription);
  const status = mapStatus(subscription.status);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

  await db
    .update(organizations)
    .set({
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: status,
      ...(plan ? { plan } : {}),
      ...(trialEnd ? { trialEndsAt: trialEnd } : {}),
      locationQuantity: subscription.items.data[0]?.quantity ?? 1,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));

  await db.insert(auditLog).values({
    organizationId,
    actor: "stripe",
    action: `subscription.${subscription.status}`,
    target: subscription.id,
    metadata: { plan, quantity: subscription.items.data[0]?.quantity ?? 1 },
  });
}

/** Resolve an org from a Stripe object's customer or metadata. */
export async function organizationForStripe(
  customerId: string | null,
  metadataOrgId?: string | null,
): Promise<Organization | null> {
  const db = getDb();
  if (metadataOrgId) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, metadataOrgId));
    if (org) return org;
  }
  if (customerId) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.stripeCustomerId, customerId));
    if (org) return org;
  }
  return null;
}

export interface BillingView {
  plan: PlanId;
  status: string;
  trialEndsAt: Date | null;
  locationCount: number;
  monthlyTotalCents: number;
  configured: boolean;
  hasSubscription: boolean;
}

export async function billingView(organizationId: string): Promise<BillingView> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const locationCount = Math.max(1, await activeLocationCount(organizationId));
  const plan: PlanId = isPlanId(org?.plan) ? org.plan : "menu";
  return {
    plan,
    status: org?.subscriptionStatus ?? "none",
    trialEndsAt: org?.trialEndsAt ?? null,
    locationCount,
    monthlyTotalCents: monthlyTotalCents(plan, locationCount),
    configured: billingConfigured(),
    hasSubscription: Boolean(org?.stripeSubscriptionId),
  };
}
