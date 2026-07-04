/**
 * src/lib/stripe.ts
 *
 * Stripe client factory: our own plan billing (Studio/Firm/Practice) and
 * Connect Standard onboarding so portal payments land in the firm's own
 * Stripe account. All Stripe access goes through this module (pinned API
 * version, idempotency keys, audit logging).
 *
 * TODO:
 * - [ ] Platform client from STRIPE_SECRET_KEY with a pinned apiVersion.
 * - [ ] Connect Standard onboarding link flow for firms (account links).
 * - [ ] forAccount(stripeAccountId): request options for connected-account
 *       calls (portal PaymentIntents).
 * - [ ] Our billing: checkout sessions for the three plans, customer portal,
 *       subscription webhooks -> firms.plan.
 * - [ ] Webhook signature verification helper shared by the route handler.
 */

import type Stripe from "stripe";

export function getPlatformStripe(): Stripe {
  throw new Error("Not implemented");
}
