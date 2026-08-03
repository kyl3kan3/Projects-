/**
 * Stripe Billing: Checkout, the customer portal, and the webhook's effects.
 *
 * Every function here degrades honestly when `STRIPE_SECRET_KEY` is absent — the
 * billing screen says billing is not configured and shows the plans, rather than
 * throwing on a page load. A repository a stranger clones has no Stripe account.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type BillingInterval, type Organization, type Plan } from "@/db/schema";
import { env, stripeConfigured } from "@/lib/env";
import { audit, SYSTEM } from "@/lib/audit";
import { PAID_PLANS, PLANS, priceCents } from "@/lib/plans";
import { ValidationError } from "@/lib/errors";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!stripeConfigured()) {
    throw new ValidationError(
      "Billing is not configured on this deployment. Set STRIPE_SECRET_KEY to enable checkout.",
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-08-27.basil" });
  }
  return _stripe;
}

export function priceIdFor(plan: Plan, interval: BillingInterval): string {
  const key = `${plan}_${interval}` as keyof ReturnType<typeof priceIdsFor>;
  return priceIdsFor()[key] ?? "";
}

function priceIdsFor() {
  return env.stripePrices;
}

/** Which plan a Stripe price id belongs to. Used by the webhook. */
export function planForPriceId(priceId: string): { plan: Plan; interval: BillingInterval } | null {
  const prices = env.stripePrices;
  for (const plan of PAID_PLANS) {
    for (const interval of ["month", "year"] as BillingInterval[]) {
      const key = `${plan}_${interval}` as keyof typeof prices;
      if (prices[key] && prices[key] === priceId) return { plan, interval };
    }
  }
  return null;
}

/**
 * Create a Checkout session.
 *
 * When a plan's price id is not configured, an inline `price_data` is used instead of
 * failing: a self-hosted deployment that has not created products in Stripe can still
 * take a payment at the documented price, and the price comes from `lib/plans.ts`,
 * which is the same source the pricing page renders from.
 */
export async function createCheckoutSession(input: {
  org: Organization;
  plan: Plan;
  interval: BillingInterval;
  email: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const client = stripe();
  const configured = priceIdFor(input.plan, input.interval);

  let customerId = input.org.stripeCustomerId;
  if (!customerId) {
    const customer = await client.customers.create({
      email: input.email,
      name: input.org.name,
      metadata: { organizationId: input.org.id },
    });
    customerId = customer.id;
    await getDb()
      .update(organizations)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(organizations.id, input.org.id));
  }

  const session = await client.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      configured
        ? { price: configured, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: priceCents(input.plan, input.interval),
              recurring: { interval: input.interval },
              product_data: {
                name: `GreenTally ${PLANS[input.plan].name}`,
                description: PLANS[input.plan].blurb,
              },
            },
          },
    ],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.org.id,
    subscription_data: {
      metadata: { organizationId: input.org.id, plan: input.plan, interval: input.interval },
    },
    metadata: { organizationId: input.org.id, plan: input.plan, interval: input.interval },
    allow_promotion_codes: true,
  });

  if (!session.url) throw new ValidationError("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(org: Organization, returnUrl: string): Promise<string> {
  if (!org.stripeCustomerId) {
    throw new ValidationError("There is no Stripe customer for this organisation yet.");
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: returnUrl,
  });
  return session.url;
}

/* ----------------------------------------------------------------- webhooks --- */

/**
 * Apply a plan change.
 *
 * Idempotent by construction: it writes the plan the subscription says, so replaying an
 * event is a no-op. Stripe retries webhooks, and an event handler that toggled state
 * would eventually get it wrong.
 */
export async function applyPlan(
  organizationId: string,
  plan: Plan,
  interval: BillingInterval | null,
  subscriptionId: string | null,
): Promise<void> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return;
  if (org.plan === plan && org.billingInterval === interval && org.stripeSubscriptionId === subscriptionId) {
    return;
  }
  await db
    .update(organizations)
    .set({
      plan,
      billingInterval: interval,
      stripeSubscriptionId: subscriptionId,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, organizationId));
  await audit({
    organizationId,
    actor: SYSTEM,
    action: "plan.changed",
    target: PLANS[plan].name,
    metadata: { plan, interval: interval ?? "none", from: org.plan },
  });
}

/** Resolve the org a Stripe object belongs to, without trusting the metadata alone. */
export async function orgForCustomer(customerId: string): Promise<Organization | null> {
  const [org] = await getDb()
    .select()
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId));
  return org ?? null;
}
