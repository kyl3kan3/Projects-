/**
 * src/lib/deposits.ts
 *
 * Deposit collection via Stripe on the contractor's connected account, plus
 * QuoteFox's own plan billing. All Stripe API access goes through this
 * module so API version pinning, idempotency keys, and audit logging live
 * in one place.
 *
 * TODO:
 * - [ ] Platform Stripe client from STRIPE_SECRET_KEY with a pinned
 *       apiVersion (never "latest").
 * - [ ] Connect onboarding: buildConnectAuthorizeUrl(state),
 *       exchangeCodeForAccount(code), store stripe_connect_account_id.
 * - [ ] createDepositCheckout(proposalId): Checkout session ON the
 *       connected account (funds + statement descriptor are the
 *       contractor's; zero application fee), idempotency key derived from
 *       the deposits row id.
 * - [ ] computeDepositAmount(estimate): percent | fixed, min/max clamps,
 *       warning surface for state deposit caps (e.g. CA 10%/$1,000).
 * - [ ] Our own billing: plan checkout, customer portal link, subscription
 *       webhook handlers -> organizations.plan.
 * - [ ] Refund passthrough: reflect refunds/disputes from webhooks onto
 *       deposits.status; never initiate refunds ourselves.
 */

import type Stripe from "stripe";

export interface DepositIntent {
  depositId: string;
  checkoutUrl: string;
  amountCents: number;
}

export function getPlatformStripe(): Stripe {
  throw new Error("Not implemented");
}

export function buildConnectAuthorizeUrl(_state: string): string {
  throw new Error("Not implemented");
}

export function createDepositCheckout(_proposalId: string): Promise<DepositIntent> {
  throw new Error("Not implemented");
}
