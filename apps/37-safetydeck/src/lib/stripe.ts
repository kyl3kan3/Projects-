/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for SafetyDeck itself: three flat tiers by field
 * headcount. All Stripe access goes through this module.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion.
 * - [ ] createCheckoutSession(companyId, plan) for
 *       STRIPE_PRICE_{CREW|COMPANY|FLEET}.
 * - [ ] createBillingPortalSession(companyId).
 * - [ ] headcountLimit(plan): { crew: 15, company: 40, fleet: 100 } active
 *       field employees; adding employee N+1 prompts an upgrade, never
 *       blocks silently and never disables existing records.
 * - [ ] handleSubscriptionEvent(event): sync companies.plan; cancellation
 *       flips the account to read-only "records preserved" state (the
 *       5-year retention duty means we never hard-delete on churn without
 *       an explicit export-and-destroy request).
 */

export type PlanId = "crew" | "company" | "fleet";

export const PLAN_HEADCOUNT_LIMITS: Record<PlanId, number> = {
  crew: 15,
  company: 40,
  fleet: 100,
};

export function createCheckoutSession(): never {
  throw new Error("Not implemented");
}
