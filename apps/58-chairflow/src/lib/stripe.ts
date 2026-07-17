/**
 * src/lib/stripe.ts
 *
 * Two Stripe surfaces, one client:
 * 1. CONNECT (Express) — the stylist's own account: client SetupIntents,
 *    deposit PaymentIntents, fee captures (lib/fees.ts), rent payment
 *    links. Created with { stripeAccount } per call.
 * 2. BILLING (platform) — ChairFlow's own subscription: hosted checkout
 *    for Chair/Book/Shop, customer portal, webhook-driven plan state.
 *
 * TODO:
 * - [ ] Lazy Stripe singleton pinned to the apiVersion matching the
 *       installed stripe major (check node_modules/stripe/package.json).
 * - [ ] createExpressAccount(stylistId) + onboarding link; refresh
 *       connect_status from account.updated events.
 * - [ ] createSetupIntent(clientId) / createDepositIntent(appointment)
 *       on the Connect account.
 * - [ ] createCheckoutSession(stylistId, plan) / createPortalSession.
 * - [ ] applySubscriptionState(webhookEventId): idempotent plan updates;
 *       failed payment -> grace -> booking page shows "fully booked",
 *       never a public error.
 */

export type Plan = "chair" | "book" | "shop";

export async function createExpressOnboardingLink(stylistId: string): Promise<{ url: string }> {
  throw new Error("Not implemented");
}

export async function createCheckoutSession(stylistId: string, plan: Plan): Promise<{ url: string }> {
  throw new Error("Not implemented");
}

export async function applySubscriptionState(webhookEventId: string): Promise<void> {
  throw new Error("Not implemented");
}
