/**
 * Stripe: PaidWell's own subscription billing, and portal payments taken on the
 * firm's *own* connected account.
 *
 * The Connect split matters commercially and is stated in README: we never take a
 * cut and never hold the firm's money. A portal PaymentIntent is created with
 * `stripeAccount: firm.stripeAccountId`, so funds settle directly to the firm and
 * their existing Stripe relationship, fees and payout schedule are untouched.
 *
 * All Stripe access goes through this module: one pinned API version, one place
 * where idempotency keys are set, one place to look when a payment goes missing.
 */

import Stripe from "stripe";
import { env, has } from "@/lib/env";
import type { Plan } from "@/db/schema";
import { plan } from "@/lib/plans";

// Pinned deliberately: an unpinned version means Stripe can change response
// shapes under a deployed app.
const API_VERSION = "2025-08-27.basil";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: API_VERSION });
  }
  return _stripe;
}

export function stripeConfigured(): boolean {
  return has("STRIPE_SECRET_KEY");
}

/* ----------------------------------------------------------- our billing --- */

export interface CheckoutArgs {
  firmId: string;
  firmName: string;
  planId: Plan;
  email: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

/**
 * A Checkout session for one of the three plans.
 *
 * When a plan has no configured price id we create the price inline from
 * `PLANS`, so a fresh install can be exercised end to end before anyone has set
 * up a Stripe product — the amounts are the ones in README's pricing table.
 */
export async function createCheckoutSession(args: CheckoutArgs): Promise<Stripe.Checkout.Session> {
  const features = plan(args.planId);
  const priceId = env.stripePrices[args.planId];

  return stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer: args.customerId ?? undefined,
      customer_email: args.customerId ? undefined : args.email,
      client_reference_id: args.firmId,
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
                  name: `PaidWell ${features.name}`,
                  description: features.blurb,
                },
              },
            },
      ],
      subscription_data: { metadata: { firmId: args.firmId, plan: args.planId } },
      metadata: { firmId: args.firmId, plan: args.planId },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      allow_promotion_codes: true,
    },
    { idempotencyKey: `checkout:${args.firmId}:${args.planId}:${new Date().toISOString().slice(0, 13)}` },
  );
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<Stripe.BillingPortal.Session> {
  return stripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
}

/* -------------------------------------------------------- Connect onboarding --- */

/** A Standard Connect account link, so the firm keeps their own Stripe account. */
export async function createConnectOnboardingLink(args: {
  firmId: string;
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
        metadata: { firmId: args.firmId },
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

/* ------------------------------------------------------------ portal pay --- */

export interface PortalIntentArgs {
  firmId: string;
  firmName: string;
  stripeAccountId: string;
  clientId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  currency: string;
  /** Card only, or card plus US bank debit. */
  allowAch: boolean;
}

/**
 * A PaymentIntent on the firm's connected account.
 *
 * The idempotency key is derived from the invoice and amount, so a client who
 * double-taps Pay creates one intent, not two.
 */
export async function createPortalPaymentIntent(
  args: PortalIntentArgs,
): Promise<Stripe.PaymentIntent> {
  return stripe().paymentIntents.create(
    {
      amount: args.amountCents,
      currency: (args.currency || "usd").toLowerCase(),
      payment_method_types: args.allowAch ? ["card", "us_bank_account"] : ["card"],
      description: `${args.firmName} — invoice ${args.invoiceNumber}`,
      statement_descriptor_suffix: args.invoiceNumber.slice(0, 22),
      metadata: {
        paidwellFirmId: args.firmId,
        paidwellClientId: args.clientId,
        paidwellInvoiceId: args.invoiceId,
        paidwellInvoiceNumber: args.invoiceNumber,
      },
    },
    {
      stripeAccount: args.stripeAccountId,
      idempotencyKey: `portal:${args.invoiceId}:${args.amountCents}`,
    },
  );
}

export function verifyWebhook(payload: string, signature: string): Stripe.Event {
  return stripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
}
