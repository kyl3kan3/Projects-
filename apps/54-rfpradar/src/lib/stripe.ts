/**
 * src/lib/stripe.ts
 *
 * Stripe Billing for the three seat tiers (Scout $99 / Pursuit $199 /
 * Capture $299). Hosted checkout + customer portal; webhooks drive plan
 * state (see api/webhooks/stripe).
 *
 * TODO:
 * - [ ] Lazy Stripe singleton pinned to the apiVersion matching the
 *       installed stripe major (check node_modules/stripe/package.json).
 * - [ ] createCheckoutSession(firmId, plan): mode "subscription",
 *       metadata.firmId, success/cancel URLs under env.appUrl.
 * - [ ] createPortalSession(firmId).
 * - [ ] applySubscriptionState(event): idempotent plan updates from
 *       persisted webhook events; grace period on payment failure, then
 *       read-only mode (library export stays available).
 */

export type Plan = "scout" | "pursuit" | "capture";

export async function createCheckoutSession(firmId: string, plan: Plan): Promise<{ url: string }> {
  throw new Error("Not implemented");
}

export async function createPortalSession(firmId: string): Promise<{ url: string }> {
  throw new Error("Not implemented");
}

export async function applySubscriptionState(webhookEventId: string): Promise<void> {
  throw new Error("Not implemented");
}
