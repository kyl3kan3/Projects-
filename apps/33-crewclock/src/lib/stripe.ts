/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for CrewClock itself: per-seat quantity subscriptions
 * with the $49/month floor. All Stripe API access goes through this
 * module so API version pinning and idempotency live in one place.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion
 *       (never "latest").
 * - [ ] createCheckoutSession(orgId, plan, seatCount): per-unit price
 *       (STRIPE_PRICE_CREW_MONTHLY / STRIPE_PRICE_COMPANY_MONTHLY) with
 *       quantity = active seats; 30-day trial.
 * - [ ] syncSeatQuantity(orgId): on crew invite/deactivate, update the
 *       subscription quantity with proration disabled (true-up at cycle).
 * - [ ] applyMonthlyFloor(orgId): when seats x unit price < $49, add the
 *       floor adjustment line item via invoice.created webhook -- the
 *       invoice total never falls below $49.
 * - [ ] pauseForSeason(orgId) / resume(orgId): the off-season pause state
 *       ($10/mo data retention -- README Key Risk 5).
 * - [ ] createBillingPortalSession(orgId) for card + cancellation.
 * - [ ] Webhook handlers consumed by /api/webhooks/stripe: checkout
 *       completed, invoice.created (floor), subscription updated/deleted.
 */

import type Stripe from "stripe";
import type { Plan } from "../db/schema";

export const MONTHLY_FLOOR_CENTS = 4900;

export interface SeatSubscription {
  stripeSubscriptionId: string;
  plan: Plan;
  seatCount: number;
}

export function getStripe(): Stripe {
  throw new Error("Not implemented");
}

export function createCheckoutSession(
  _orgId: string,
  _plan: Plan,
  _seatCount: number,
): Promise<string> {
  throw new Error("Not implemented");
}

export function syncSeatQuantity(_orgId: string): Promise<void> {
  throw new Error("Not implemented");
}
