/**
 * The Stripe client and QuoteFox's own subscription billing.
 *
 * Everything Stripe goes through this module: one pinned API version, one place
 * idempotency keys are set, one place to look when a payment goes missing. The
 * deposit path (on the *contractor's* connected account) lives in
 * src/lib/deposits.ts and calls `stripe()` from here.
 */

import Stripe from "stripe";
import { env, has } from "@/lib/env";
import { plan } from "@/lib/plans";
import type { Plan } from "@/db/schema";

// Pinned deliberately: an unpinned version lets Stripe change response shapes
// under a deployed app.
const API_VERSION = "2025-08-27.basil";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey, { apiVersion: API_VERSION });
  return _stripe;
}

export function stripeConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

export function webhookConfigured(): boolean {
  return has("STRIPE_WEBHOOK_SECRET");
}

export function verifyWebhook(payload: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
}

/* ------------------------------------------------------- our own billing --- */

export interface PlanCheckoutArgs {
  organizationId: string;
  organizationName: string;
  planId: Plan;
  email: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Checkout for one of the three plans.
 *
 * When a plan has no configured price id the price is created inline from
 * `PLANS`, so a fresh install can be exercised end to end before anyone has built
 * a product catalogue — the amounts are README's pricing table.
 */
export async function createPlanCheckout(args: PlanCheckoutArgs): Promise<Stripe.Checkout.Session> {
  const features = plan(args.planId);
  const priceId = env.stripePrices[args.planId];
  return stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer: args.customerId ?? undefined,
      customer_email: args.customerId ? undefined : args.email,
      client_reference_id: args.organizationId,
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: features.priceCents,
                recurring: { interval: "month" },
                product_data: {
                  name: `QuoteFox ${features.name}`,
                  description: features.blurb,
                },
              },
            },
      ],
      subscription_data: {
        metadata: { organizationId: args.organizationId, plan: args.planId },
      },
      metadata: { organizationId: args.organizationId, plan: args.planId },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      allow_promotion_codes: true,
    },
    {
      idempotencyKey: `plan:${args.organizationId}:${args.planId}:${new Date().toISOString().slice(0, 13)}`,
    },
  );
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  return stripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

/* ------------------------------------------------------ connect onboarding --- */

/**
 * A **Standard** connected account, so the contractor keeps their own Stripe
 * relationship, their own fees, and their own payout schedule — and so KYC and
 * dispute liability never touch us.
 */
export async function createConnectOnboardingLink(args: {
  organizationId: string;
  email: string;
  existingAccountId?: string | null;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ accountId: string; url: string }> {
  const client = stripe();
  const accountId =
    args.existingAccountId ??
    (
      await client.accounts.create({
        type: "standard",
        email: args.email,
        metadata: { organizationId: args.organizationId },
      })
    ).id;
  const link = await client.accountLinks.create({
    account: accountId,
    refresh_url: args.refreshUrl,
    return_url: args.returnUrl,
    type: "account_onboarding",
  });
  return { accountId, url: link.url };
}
