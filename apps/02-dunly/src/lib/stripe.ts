/**
 * src/lib/stripe.ts
 *
 * Stripe client factory and Connect helpers. All Stripe API access goes
 * through this module so API version pinning, idempotency keys, and
 * audit logging live in one place.
 *
 * TODO:
 * - [ ] Platform Stripe client from STRIPE_SECRET_KEY with a pinned
 *       apiVersion (never "latest").
 * - [ ] forAccount(stripeAccountId): client scoped to a connected account
 *       via the Stripe-Account header.
 * - [ ] Connect OAuth: buildAuthorizeUrl(state), exchangeCodeForAccount(code).
 * - [ ] retryInvoice(accountId, invoiceId, idempotencyKey) -> invoices.pay;
 *       every call MUST pass an idempotency key derived from the
 *       recovery_attempts row id (double-charge protection).
 * - [ ] isStripeSmartRetryActive(invoice): suppression check so we never
 *       retry alongside Stripe's own Smart Retries.
 * - [ ] createCardUpdateSetupIntent(accountId, customerId).
 * - [ ] classifyDeclineCode(code): "hard" | "soft" -- hard declines
 *       short-circuit remaining retries.
 * - [ ] backfillAccount(accountId): page through last 90 days of invoices,
 *       customers, subscriptions, payment methods.
 */

import type Stripe from "stripe";

export type DeclineClass = "hard" | "soft";

export interface ConnectedAccountContext {
  stripeAccountId: string;
  livemode: boolean;
}

export function getPlatformStripe(): Stripe {
  throw new Error("Not implemented");
}

export function buildConnectAuthorizeUrl(_state: string): string {
  throw new Error("Not implemented");
}

export function classifyDeclineCode(_code: string): DeclineClass {
  throw new Error("Not implemented");
}
