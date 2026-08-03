"use server";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type Plan } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireOnboardedUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { PLAN_ORDER } from "@/lib/plans";
import {
  createBillingPortalSession,
  createConnectOnboardingLink,
  createPlanCheckout,
  stripeConfigured,
} from "@/lib/stripe";

export interface BillingState {
  error?: string;
  url?: string;
}

/**
 * Start Checkout for one of the three plans.
 *
 * Nothing about the org's plan changes here: the `checkout.session.completed`
 * webhook is the only thing allowed to do that, so a customer who abandons Stripe's
 * page does not end up on a plan they never paid for.
 */
export async function startPlanCheckoutAction(planId: string): Promise<BillingState> {
  const { org, user } = await requireOnboardedUser();
  if (!PLAN_ORDER.includes(planId as Plan)) return { error: "Unknown plan." };
  if (!stripeConfigured()) {
    return {
      error:
        "Stripe is not configured on this install, so checkout cannot open. Set STRIPE_SECRET_KEY and try again.",
    };
  }
  try {
    const session = await createPlanCheckout({
      organizationId: org.id,
      organizationName: org.name,
      planId: planId as Plan,
      email: user.email,
      customerId: org.billingStripeCustomerId,
      successUrl: `${env.appUrl}/settings/billing?upgraded=1`,
      cancelUrl: `${env.appUrl}/settings/billing`,
    });
    if (!session.url) return { error: "Stripe did not return a checkout page." };
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open checkout." };
  }
}

export async function openBillingPortalAction(): Promise<BillingState> {
  const { org } = await requireOnboardedUser();
  if (!stripeConfigured()) return { error: "Stripe is not configured on this install." };
  if (!org.billingStripeCustomerId) {
    return { error: "There is no subscription to manage yet." };
  }
  try {
    const session = await createBillingPortalSession(
      org.billingStripeCustomerId,
      `${env.appUrl}/settings/billing`,
    );
    return { url: session.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the billing portal." };
  }
}

/**
 * Connect the contractor's own Stripe account, so deposits land there and QuoteFox
 * never touches the money.
 */
export async function connectStripeAction(): Promise<BillingState> {
  const { org, user } = await requireOnboardedUser();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this install, so accounts cannot be connected." };
  }
  try {
    const link = await createConnectOnboardingLink({
      organizationId: org.id,
      email: user.email,
      existingAccountId: org.stripeConnectAccountId,
      refreshUrl: `${env.appUrl}/settings/billing`,
      returnUrl: `${env.appUrl}/settings/billing?connected=1`,
    });
    const db = getDb();
    await db
      .update(organizations)
      .set({ stripeConnectAccountId: link.accountId, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
    await audit(org.id, user.id, "stripe_connected", link.accountId, { stage: "onboarding_started" });
    return { url: link.url };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start Stripe onboarding." };
  }
}
