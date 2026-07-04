/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for BidBoard itself: three flat tiers with project/seat
 * limits enforced in-app. All Stripe access goes through this module.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion.
 * - [ ] createCheckoutSession(companyId, plan) for
 *       STRIPE_PRICE_{CREW|BUILDER|PRECON}.
 * - [ ] createBillingPortalSession(companyId).
 * - [ ] planLimits(plan): { crew: {projects: 3, seats: 2},
 *       builder: {projects: 10, seats: 5},
 *       precon: {projects: Infinity, seats: 12} } -- consulted by project
 *       creation and seat invites; over-limit blocks with an upgrade
 *       prompt, never silently.
 * - [ ] handleSubscriptionEvent(event): sync companies.plan; downgrades
 *       never delete data -- excess projects become read-only "paused".
 */

export type PlanId = "crew" | "builder" | "precon";

export interface PlanLimits {
  activeProjects: number;
  seats: number;
}

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  crew: { activeProjects: 3, seats: 2 },
  builder: { activeProjects: 10, seats: 5 },
  precon: { activeProjects: Number.POSITIVE_INFINITY, seats: 12 },
};

export function createCheckoutSession(): never {
  throw new Error("Not implemented");
}
