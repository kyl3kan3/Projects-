/**
 * src/lib/payments.ts
 *
 * Stripe money paths: registration checkout on the club's connected
 * account with our per-registration application fee, installment plans,
 * refunds, and RosterRally's own flat-plan billing.
 *
 * TODO:
 * - [ ] Platform Stripe client with pinned apiVersion; Connect Standard
 *       onboarding (account links) for clubs.
 * - [ ] createRegistrationCheckout(registrationIds): one session per
 *       household cart; application_fee_amount = APPLICATION_FEE_CENTS per
 *       paid registration; fee skipped for scholarship codes and
 *       flat-plan clubs; club chooses absorb vs pass-through (line item
 *       shown honestly either way).
 * - [ ] Installments: deposit PaymentIntent + subscription schedule for
 *       the remainder; failed-installment retry + registrar notification.
 * - [ ] refund(registrationId, amount): connected-account refund,
 *       application-fee refund proportionally, audit-logged.
 * - [ ] Our flat plan: checkout, customer portal, subscription webhooks ->
 *       clubs.plan.
 * - [ ] Webhook signature verification shared by the route handler.
 */

import type Stripe from "stripe";

export function getPlatformStripe(): Stripe {
  throw new Error("Not implemented");
}

export function createRegistrationCheckout(
  _registrationIds: string[],
): Promise<{ checkoutUrl: string }> {
  throw new Error("Not implemented");
}
