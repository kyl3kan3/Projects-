/**
 * src/lib/billing.ts
 *
 * Stripe billing: subscriptions (Freelancer/Studio) with monthly credit
 * grants, $19 one-time per-contract checkout, $9 overage, and the credits
 * ledger. Failed reviews auto-refund their credit — trust product.
 *
 * TODO:
 * - [ ] Platform Stripe client with pinned apiVersion.
 * - [ ] oneTimeCheckout(email): $19 -> purchases row (1 credit) + implicit
 *       account (magic link) so the report is retrievable.
 * - [ ] Subscription webhooks: monthly grant rows (5/25 credits,
 *       expires_at = period end, no rollover — stated plainly in UI).
 * - [ ] reserveCredit(accountId, contractId) at upload / refundCredit on
 *       pipeline failure (atomic against the ledger).
 * - [ ] Overage: in-product confirmation before a $9 charge, never silent.
 * - [ ] creditBalance(accountId): grants minus consumption, expiry-aware.
 * - [ ] Customer portal link; plan gating (custom playbooks = studio).
 */

import type Stripe from "stripe";

export function getStripe(): Stripe {
  throw new Error("Not implemented");
}

export function reserveCredit(
  _accountId: string,
  _contractId: string,
): Promise<void> {
  throw new Error("Not implemented");
}
