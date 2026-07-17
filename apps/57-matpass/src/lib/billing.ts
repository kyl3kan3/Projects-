/**
 * src/lib/billing.ts
 *
 * Two Stripe surfaces: family tuition on the school's own Connect account,
 * and MatPass's own subscription. Tuition never touches the platform
 * balance; card details are collected only by Stripe-hosted flows.
 *
 * TODO:
 * - [ ] connectOnboarding(): Stripe Connect Standard account link for the
 *       school; store stripe_account_id.
 * - [ ] syncMembershipPlan(): mirror a membership plan as a price on the
 *       connected account.
 * - [ ] subscribeFamily(): create the customer + subscription on the
 *       connected account; payment method collected via a Stripe-hosted
 *       link the parent completes (never a MatPass form).
 * - [ ] applyStripeEvent(): worker-side, idempotent by event id —
 *       subscription status changes, past_due flips (+ pastDueSince),
 *       MatPass plan changes from platform events.
 * - [ ] dunning(): email the family a hosted payment-update link; escalate
 *       to a desk task after 2 failures. NEVER blocks attendance (the
 *       ground rule with a test).
 * - [ ] pauseSubscription(): summer/injury pause — Stripe pause + student
 *       status paused (retention scan ignores paused).
 * - [ ] MatPass's own tiers: hosted checkout, customer portal, soft
 *       student-count limits (student 101 on Dojo prompts upgrade, never
 *       blocks a check-in).
 */

export async function subscribeFamily(_input: {
  familyId: string;
  membershipPlanId: string;
  studentIds: string[];
}): Promise<{ paymentLinkUrl: string }> {
  // TODO: implement per ARCHITECTURE.md key flow 3
  throw new Error("Not implemented");
}

export async function applyStripeEvent(_webhookEventId: string): Promise<void> {
  throw new Error("Not implemented");
}
