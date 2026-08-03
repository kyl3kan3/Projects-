/**
 * Stripe billing.
 *
 * The meter is APIs watched — flat per tier, checked in `plans.ts` and enforced
 * at push time. Stripe's only job here is collecting the money and telling us
 * which tier is live, so there is no usage reporting and no metered price.
 *
 * There is no Stripe key in this environment, so `stripe()` throws a
 * distinguishable error and the settings screen shows an honest "billing is not
 * configured" state instead of a broken checkout button. Everything the app
 * decides — limits, gates, upgrade paths — is in `plans.ts` and is unit-tested
 * without Stripe.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, organizations, type Organization, type Plan } from "@/db/schema";
import { env, has } from "@/lib/env";
import { PAID_PLANS, PLANS } from "@/lib/plans";

export class BillingNotConfigured extends Error {
  constructor() {
    super("Stripe is not configured. Set STRIPE_SECRET_KEY and the three price IDs.");
    this.name = "BillingNotConfigured";
  }
}

export function billingConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

/** Which plans can actually be bought right now? */
export function purchasablePlans(): Plan[] {
  if (!billingConfigured()) return [];
  const prices = env.stripePrices;
  return PAID_PLANS.filter((plan) => Boolean(prices[plan as keyof typeof prices]));
}

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!billingConfigured()) throw new BillingNotConfigured();
  if (!client) client = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  return client;
}

async function ensureCustomer(org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const customer = await stripe().customers.create({
    email,
    name: org.name,
    metadata: { organizationId: org.id, slug: org.slug },
  });
  await getDb()
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

export async function createCheckoutSession(org: Organization, email: string, plan: Plan): Promise<string> {
  const priceId = env.stripePrices[plan as keyof typeof env.stripePrices];
  if (!priceId) throw new BillingNotConfigured();

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: await ensureCustomer(org, email),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.appUrl}/settings?checkout=done`,
    cancel_url: `${env.appUrl}/settings?checkout=cancelled`,
    client_reference_id: org.id,
    subscription_data: { metadata: { organizationId: org.id, plan } },
  });
  if (!session.url) throw new Error("Stripe returned a session without a URL.");
  return session.url;
}

export async function createPortalSession(org: Organization): Promise<string> {
  if (!org.stripeCustomerId) throw new Error("This organization has no Stripe customer yet.");
  const session = await stripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${env.appUrl}/settings`,
  });
  return session.url;
}

/** Map a Stripe price back to a plan. Unknown prices leave the plan untouched. */
export function planForPrice(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  const prices = env.stripePrices;
  for (const plan of PAID_PLANS) {
    if (prices[plan as keyof typeof prices] === priceId) return plan;
  }
  return null;
}

/**
 * Apply a subscription's state to the organization.
 *
 * `active` and `trialing` grant the plan; anything else — canceled, unpaid,
 * past_due after retries — drops the org back to `trial` with the trial already
 * expired, so pushes are refused with an upgrade message rather than silently
 * continuing on a plan nobody is paying for.
 */
export async function applySubscription(
  organizationId: string,
  subscription: { id: string; status: string; priceId: string | null },
): Promise<void> {
  const db = getDb();
  const plan = planForPrice(subscription.priceId);
  const entitled = subscription.status === "active" || subscription.status === "trialing";

  if (entitled && plan) {
    await db
      .update(organizations)
      .set({ plan, stripeSubscriptionId: subscription.id, trialEndsAt: null })
      .where(eq(organizations.id, organizationId));
  } else {
    await db
      .update(organizations)
      .set({ plan: "trial", stripeSubscriptionId: null, trialEndsAt: new Date(Date.now() - 1000) })
      .where(eq(organizations.id, organizationId));
  }

  await db.insert(auditLog).values({
    organizationId,
    actor: "stripe",
    action: "billing.subscription",
    target: subscription.id,
    metadata: { status: subscription.status, plan: entitled && plan ? plan : "trial" } as never,
  });
}

/** Display copy for the settings screen. */
export function planSummary(org: Organization, apiCount: number): string {
  const spec = PLANS[org.plan];
  return `${spec.name} · ${apiCount} of ${spec.apiLimit} API${spec.apiLimit === 1 ? "" : "s"} · ${spec.historyDays}-day history`;
}
