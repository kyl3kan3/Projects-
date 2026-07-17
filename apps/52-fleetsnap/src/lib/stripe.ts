/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for FleetSnap's own subscription (ARCHITECTURE.md
 * flow 5). Three flat tiers by fleet size; hosted checkout + customer
 * portal.
 *
 * TODO:
 * - [ ] Lazy Stripe client from env.stripeSecretKey.
 * - [ ] createCheckoutSession(fleetId, plan): hosted checkout for the
 *       plan's price id; success/cancel URLs on env.appUrl.
 * - [ ] createPortalSession(fleetId): customer portal for card changes
 *       and cancellation.
 * - [ ] applySubscriptionEvent(event): idempotent plan-state updates from
 *       persisted webhook_events rows (checkout.session.completed,
 *       customer.subscription.updated|deleted, invoice.payment_failed).
 *       Failed payments -> grace period -> read-only mode; records remain
 *       exportable (compliance evidence is never held hostage).
 * - [ ] planLimits(plan): { maxVehicles } -- 15 / 30 / 50; enforcement
 *       lives at vehicle creation with an upgrade prompt, never a silent
 *       block.
 */

import type Stripe from "stripe";

export type Plan = "crew" | "fleet" | "depot";

export const PLAN_LIMITS: Record<Plan, { maxVehicles: number }> = {
  crew: { maxVehicles: 15 },
  fleet: { maxVehicles: 30 },
  depot: { maxVehicles: 50 },
};

/** Lazily constructed Stripe client (never at module scope). */
export function getStripe(): Stripe {
  throw new Error("Not implemented");
}

/** Hosted checkout URL for upgrading/subscribing a fleet to a plan. */
export async function createCheckoutSession(
  _fleetId: string,
  _plan: Plan,
): Promise<string> {
  throw new Error("Not implemented");
}

/** Apply a persisted Stripe event to fleet plan state. Idempotent by event id. */
export async function applySubscriptionEvent(
  _webhookEventId: string,
): Promise<void> {
  throw new Error("Not implemented");
}
