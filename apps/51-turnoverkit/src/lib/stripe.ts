/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for TurnoverKit's own subscription (ARCHITECTURE.md
 * flow 5). Three tiers by unit count; hosted checkout + customer portal.
 *
 * TODO:
 * - [ ] Lazy Stripe client from env.stripeSecretKey.
 * - [ ] createCheckoutSession(hostId, plan): hosted checkout for the
 *       plan's price id; success/cancel URLs on env.appUrl.
 * - [ ] createPortalSession(hostId): customer portal for card changes and
 *       cancellation.
 * - [ ] applySubscriptionEvent(event): idempotent plan-state updates from
 *       persisted webhook_events rows (checkout.session.completed,
 *       customer.subscription.updated|deleted, invoice.payment_failed).
 *       Failed payments -> grace period -> read-only mode; records remain
 *       visible (evidence is never held hostage).
 * - [ ] planLimits(plan): { maxUnits } -- 5 / 12 / 20; enforcement lives
 *       at unit creation with an upgrade prompt, never a silent block.
 */

import type Stripe from "stripe";

export type Plan = "solo" | "host" | "operator";

export const PLAN_LIMITS: Record<Plan, { maxUnits: number }> = {
  solo: { maxUnits: 5 },
  host: { maxUnits: 12 },
  operator: { maxUnits: 20 },
};

/** Lazily constructed Stripe client (never at module scope). */
export function getStripe(): Stripe {
  throw new Error("Not implemented");
}

/** Hosted checkout URL for upgrading/subscribing a host to a plan. */
export async function createCheckoutSession(
  _hostId: string,
  _plan: Plan,
): Promise<string> {
  throw new Error("Not implemented");
}

/** Apply a persisted Stripe event to host plan state. Idempotent by event id. */
export async function applySubscriptionEvent(
  _webhookEventId: string,
): Promise<void> {
  throw new Error("Not implemented");
}
