/**
 * Stripe Billing for LedgerLens itself. Three flat tiers plus a reported document
 * count, so the usage is visible on the invoice even though the tiers are flat.
 *
 * All Stripe access funnels through here: one pinned API version (never "latest" — a
 * silent API bump is a silent billing bug), one place that knows the price ids, and
 * one place that decides what happens when the key is absent, which is *nothing*
 * rather than a crash. A local checkout with no Stripe account still runs the whole
 * product; it just cannot take money.
 */

import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type Organization, type Plan } from "@/db/schema";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { PLANS, PLAN_DOCUMENT_CAPS, planCap } from "@/lib/plans";

export { PLAN_DOCUMENT_CAPS, planCap };

const API_VERSION = "2025-03-31.basil";

let _stripe: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey);
}

export function getStripe(): Stripe {
  if (!env.stripeSecretKey) {
    throw new ValidationError("Billing is not configured on this deployment.");
  }
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: API_VERSION as Stripe.LatestApiVersion });
  }
  return _stripe;
}

export function priceIdFor(planId: Plan): string {
  const price = env.stripePrices[planId];
  if (!price) throw new ValidationError(`No Stripe price is configured for the ${PLANS[planId].name} plan.`);
  return price;
}

async function ensureCustomer(org: Organization, email: string): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    name: org.name,
    metadata: { organizationId: org.id, forwardingSlug: org.forwardingSlug },
  });
  await getDb()
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

export async function createCheckoutSession(
  org: Organization,
  email: string,
  planId: Plan,
): Promise<string> {
  const stripe = getStripe();
  const customerId = await ensureCustomer(org, email);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(planId), quantity: 1 }],
    success_url: `${env.appUrl}/settings/billing?checkout=done`,
    cancel_url: `${env.appUrl}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { organizationId: org.id, plan: planId } },
    metadata: { organizationId: org.id, plan: planId },
  });
  if (!session.url) throw new ValidationError("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createBillingPortalSession(
  org: Organization,
  email: string,
): Promise<string> {
  const stripe = getStripe();
  const customerId = await ensureCustomer(org, email);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.appUrl}/settings/billing`,
  });
  return session.url;
}

/**
 * Report the period's document count.
 *
 * Idempotent by construction: the idempotency key is `{org}:{period}`, so a sweep
 * that runs twice in a month reports once. The tiers are flat, so this does not
 * change what is charged — it puts the number the plan is priced on onto the
 * invoice, which is what makes a cap dispute a five-second conversation.
 */
export async function reportUsage(
  org: Organization,
  period: string,
  documentCount: number,
): Promise<{ reported: boolean; reason?: string }> {
  if (env.dryRun) return { reported: false, reason: "DRY_RUN" };
  if (!stripeConfigured()) return { reported: false, reason: "stripe_not_configured" };
  if (!org.stripeCustomerId) return { reported: false, reason: "no_customer" };
  const stripe = getStripe();
  try {
    await stripe.billing.meterEvents.create(
      {
        event_name: "ledgerlens_documents",
        payload: {
          stripe_customer_id: org.stripeCustomerId,
          value: String(documentCount),
        },
        identifier: `${org.id}:${period}`,
      },
      { idempotencyKey: `${org.id}:${period}` },
    );
    return { reported: true };
  } catch (err) {
    return { reported: false, reason: err instanceof Error ? err.message : "stripe_error" };
  }
}
