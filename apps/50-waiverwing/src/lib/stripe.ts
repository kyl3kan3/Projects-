/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for WaiverWing (three plans, volume soft-caps). The
 * one hard rule: signing NEVER blocks on billing state -- a blocked
 * waiver at a busy counter is the unforgivable failure.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion
 *       (never "latest").
 * - [ ] createCheckoutSession(accountId, plan, interval): monthly +
 *       annual (2 months free); 14-day trial.
 * - [ ] createBillingPortalSession(accountId).
 * - [ ] handleWebhook(event): checkout.session.completed,
 *       customer.subscription.updated|deleted -> accounts.plan;
 *       idempotent via webhook_events.
 * - [ ] monthlyVolume(accountId): signed-waiver count this billing
 *       month; softCapState(plan, volume) -> ok | warn | over (drives
 *       banners + upgrade prompts ONLY -- never gates captureSignature).
 * - [ ] Plan gating for features: kiosk/incidents on Front Desk+,
 *       multi-location/webhooks/branding on Operator.
 */

import type { Plan } from "../db/schema";

export type SoftCapState = "ok" | "warn" | "over";

export function softCapState(_plan: Plan, _monthlyVolume: number): SoftCapState {
  throw new Error("Not implemented");
}

export function createCheckoutSession(
  _accountId: string,
  _plan: Plan,
  _interval: "monthly" | "annual",
): Promise<string> {
  throw new Error("Not implemented");
}
