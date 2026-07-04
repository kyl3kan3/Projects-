/**
 * src/lib/stripe.ts
 *
 * Stripe Billing client and plan/entitlement helpers for PermitPath's own
 * subscriptions (Crew / Company / Regional, monthly + annual). All Stripe
 * access goes through this module so API version pinning and entitlement
 * mapping live in one place. No Connect -- we never touch customer money.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion
 *       (never "latest").
 * - [ ] createCheckoutSession(orgId, plan, interval): Checkout in
 *       subscription mode; annual prices carry the 2-months-free discount.
 * - [ ] createBillingPortalSession(orgId): self-serve plan changes.
 * - [ ] planLimits(plan): users / active jobs / jurisdictions watched
 *       (crew 3/15/5, company 10/50/20, regional 25/unlimited/60) --
 *       single source of truth for gating.
 * - [ ] syncSubscriptionFromEvent(event): map subscription webhook state
 *       onto organizations.plan (webhook route calls this).
 * - [ ] applyContributionCredit(orgId, cents): customer-balance credit for
 *       accepted contributions, capped at 50% of the current invoice.
 * - [ ] Audit log entries for every plan change and credit.
 */

import type Stripe from "stripe";
import type { Plan } from "../db/schema";

export type BillingInterval = "month" | "year";

export interface PlanLimits {
  users: number;
  activeJobs: number | "unlimited";
  jurisdictionsWatched: number;
}

export function getStripe(): Stripe {
  throw new Error("Not implemented");
}

export function planLimits(_plan: Plan): PlanLimits {
  throw new Error("Not implemented");
}

export function applyContributionCredit(
  _organizationId: string,
  _cents: number,
): Promise<void> {
  throw new Error("Not implemented");
}
