/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for FormForge itself (three flat plans + trial). No
 * PHI ever reaches Stripe; customer metadata is practice id + email only.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion
 *       (never "latest").
 * - [ ] createCheckoutSession(practiceId, plan): 14-day trial, no card
 *       required variant for self-serve signup.
 * - [ ] createBillingPortalSession(practiceId) for plan changes.
 * - [ ] handleWebhook(event): checkout.session.completed,
 *       customer.subscription.updated|deleted -> practices.plan.
 * - [ ] Plan gating helpers: clinicianCap(plan), canSendIntake(practice)
 *       -- over-cap blocks NEW sends only; reads/exports always work
 *       (ROADMAP acceptance criterion).
 */

import type { Plan } from "../db/schema";

export interface PlanGate {
  plan: Plan;
  clinicianCap: number;
  canSend: boolean;
}

export function clinicianCap(_plan: Plan): number {
  throw new Error("Not implemented");
}

export function createCheckoutSession(_practiceId: string, _plan: Plan): Promise<string> {
  throw new Error("Not implemented");
}
