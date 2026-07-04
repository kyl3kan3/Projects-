/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for GrantGrid (three flat plans + trial). Annual plans
 * matter here -- nonprofits budget annually.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion
 *       (never "latest").
 * - [ ] createCheckoutSession(orgId, plan, interval): monthly + annual
 *       (2 months free) prices per plan; 14-day trial.
 * - [ ] createBillingPortalSession(orgId) for plan changes.
 * - [ ] handleWebhook(event): checkout.session.completed,
 *       customer.subscription.updated|deleted -> organizations.plan.
 * - [ ] Plan gating: trackedGrantCap(plan) (Seed: 25), discovery access
 *       (Grow+), multi-org (Field). Over-cap blocks NEW adds with an
 *       upgrade prompt -- never data loss (ROADMAP criterion).
 */

import type { Plan } from "../db/schema";

export type BillingInterval = "monthly" | "annual";

export function trackedGrantCap(_plan: Plan): number {
  throw new Error("Not implemented");
}

export function createCheckoutSession(
  _orgId: string,
  _plan: Plan,
  _interval: BillingInterval,
): Promise<string> {
  throw new Error("Not implemented");
}
