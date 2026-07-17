/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for PriceProbe's own subscription (ARCHITECTURE.md
 * flow 6). Three tiers by tracked SKUs; hosted checkout + customer
 * portal.
 *
 * TODO:
 * - [ ] Lazy Stripe client from env.stripeSecretKey.
 * - [ ] createCheckoutSession(brandId, plan): hosted checkout for the
 *       plan's price id; success/cancel URLs on env.appUrl.
 * - [ ] createPortalSession(brandId): customer portal for card changes
 *       and cancellation.
 * - [ ] applySubscriptionEvent(event): idempotent plan-state updates from
 *       persisted webhook_events rows (checkout.session.completed,
 *       customer.subscription.updated|deleted, invoice.payment_failed).
 *       Failed payments -> grace period -> paused checks; history remains
 *       readable.
 * - [ ] planLimits(plan): { maxSkus, checksPerDay } -- 100/2, 300/4,
 *       1000/4+hourly-flagged; enforcement lives at SKU tracking with an
 *       upgrade prompt, never a silent block.
 */

import type Stripe from "stripe";

export type Plan = "watch" | "desk" | "floor";

export const PLAN_LIMITS: Record<
  Plan,
  { maxSkus: number; checksPerDay: number; hourlyFlagged: boolean }
> = {
  watch: { maxSkus: 100, checksPerDay: 2, hourlyFlagged: false },
  desk: { maxSkus: 300, checksPerDay: 4, hourlyFlagged: false },
  floor: { maxSkus: 1000, checksPerDay: 4, hourlyFlagged: true },
};

/** Lazily constructed Stripe client (never at module scope). */
export function getStripe(): Stripe {
  throw new Error("Not implemented");
}

/** Hosted checkout URL for upgrading/subscribing a brand to a plan. */
export async function createCheckoutSession(
  _brandId: string,
  _plan: Plan,
): Promise<string> {
  throw new Error("Not implemented");
}

/** Apply a persisted Stripe event to brand plan state. Idempotent by event id. */
export async function applySubscriptionEvent(
  _webhookEventId: string,
): Promise<void> {
  throw new Error("Not implemented");
}
