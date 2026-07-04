/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for LedgerLens itself: three flat tiers plus metered
 * document counts. All Stripe access goes through this module so API
 * version pinning and idempotency live in one place.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion
 *       (never "latest").
 * - [ ] createCheckoutSession(orgId, plan): subscription checkout for
 *       STRIPE_PRICE_{SOLO|OPERATOR|PRO}; success/cancel URLs on APP_URL.
 * - [ ] createBillingPortalSession(orgId): upgrades, downgrades, cancel.
 * - [ ] reportUsage(orgId, period, documentCount): usage records for the
 *       metered component, idempotency key = `${orgId}:${period}`.
 * - [ ] planCap(plan): { solo: 75, operator: 300, pro: 1000 } documents/mo;
 *       the worker consults this before extracting (soft cap -- queue,
 *       never surprise-bill).
 * - [ ] handleSubscriptionEvent(event): keep organizations.plan and
 *       stripe_customer_id in sync from webhook events.
 */

export type PlanId = "solo" | "operator" | "pro";

export const PLAN_DOCUMENT_CAPS: Record<PlanId, number> = {
  solo: 75,
  operator: 300,
  pro: 1000,
};

export function createCheckoutSession(): never {
  throw new Error("Not implemented");
}
