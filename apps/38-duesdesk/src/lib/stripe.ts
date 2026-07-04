/**
 * src/lib/stripe.ts
 *
 * All Stripe access: the Connect platform surface (association dues) AND
 * DuesDesk's own Billing. One module so API version pinning, idempotency,
 * and the never-touch-association-funds rule live in one place.
 *
 * TODO:
 * - [ ] Stripe client from STRIPE_SECRET_KEY with a pinned apiVersion.
 * - [ ] Connect onboarding: createConnectAccountLink(associationId) for
 *       Standard accounts; store stripe_account_id; handle return/refresh.
 * - [ ] Dues checkout: createDuesCheckout(invoiceId): hosted checkout with
 *       destination = the association's account -- card + us_bank_account,
 *       ACH listed first (the nudge). Funds NEVER settle on the platform.
 * - [ ] Autopay: createAutopaySetup(householdId) (SetupIntent, gated by
 *       the magic-link step-up upstream) and
 *       chargeAutopay(invoiceId): off-session PaymentIntent, idempotency
 *       key `invoice:{id}`, destination charge.
 * - [ ] Our billing: createCheckoutSession(associationId, plan) for
 *       STRIPE_PRICE_{BLOCK|NEIGHBORHOOD|COMMUNITY}; billing portal.
 * - [ ] memberLimit(plan): { block: 75, neighborhood: 200, community: 500 }
 *       households/members; over-limit prompts upgrade, never blocks
 *       silently.
 * - [ ] handleWebhook(event, source: platform|connect): payment_intent
 *       lifecycle (incl. ACH processing -> succeeded), account.updated,
 *       subscription events -- routed to invoicing/autopay modules.
 */

export type PlanId = "block" | "neighborhood" | "community";

export const PLAN_MEMBER_LIMITS: Record<PlanId, number> = {
  block: 75,
  neighborhood: 200,
  community: 500,
};

export function createDuesCheckout(): never {
  throw new Error("Not implemented");
}

export function chargeAutopay(): never {
  throw new Error("Not implemented");
}
