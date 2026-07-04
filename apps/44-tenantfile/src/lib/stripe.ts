/**
 * src/lib/stripe.ts
 *
 * Stripe: rent collection on the landlord's own Connect account (ACH-first)
 * and TenantFile's own plan billing. All Stripe access goes through this
 * module (pinned API version, idempotency keys, audit logging).
 *
 * TODO:
 * - [ ] Platform client from STRIPE_SECRET_KEY with a pinned apiVersion.
 * - [ ] Connect Standard onboarding for landlords (account links); rent
 *       PaymentIntents (us_bank_account + card) on the connected account.
 * - [ ] Card-fee pass-through toggle per landlord (fee math shown honestly
 *       on the pay page).
 * - [ ] Our billing: checkout for keys/building/portfolio, customer portal,
 *       subscription webhooks -> landlords.plan; unit-count gating helper.
 * - [ ] Webhook signature verification shared by the route handler.
 */

import type Stripe from "stripe";

export function getPlatformStripe(): Stripe {
  throw new Error("Not implemented");
}
