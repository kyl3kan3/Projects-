/**
 * Stripe clients. The platform client handles Connect OAuth + our own
 * billing; connected-account calls pass `stripeAccount` per request.
 * API version pinned — the whole product sits on this contract.
 */

import Stripe from "stripe";
import { env } from "@/lib/env";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(env.stripeSecretKey, {
      apiVersion: "2025-08-27.basil",
      appInfo: { name: "Dunly", url: "https://dunly.app" },
    });
  }
  return _stripe;
}

/** Run a call against a connected account. */
export function onAccount(stripeAccountId: string): { stripeAccount: string } {
  return { stripeAccount: stripeAccountId };
}

export function connectAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.stripeConnectClientId,
    scope: "read_write",
    redirect_uri: `${env.appUrl}/api/stripe/connect/callback`,
    state,
  });
  return `https://connect.stripe.com/oauth/authorize?${params}`;
}

/** MRR normalization: monthly-ize a subscription item price. */
export function mrrCentsForSubscription(sub: Stripe.Subscription): number {
  let total = 0;
  for (const item of sub.items.data) {
    const price = item.price;
    if (!price?.unit_amount || price.recurring == null) continue;
    const qty = item.quantity ?? 1;
    const amount = price.unit_amount * qty;
    const { interval, interval_count: n = 1 } = price.recurring;
    if (interval === "month") total += amount / n;
    else if (interval === "year") total += amount / (12 * n);
    else if (interval === "week") total += (amount * 52) / 12 / n;
    else if (interval === "day") total += (amount * 365) / 12 / n;
  }
  return Math.round(total);
}

/** Hard declines that make further retries pointless (and rude). */
const HARD_DECLINES = new Set([
  "stolen_card",
  "lost_card",
  "pickup_card",
  "fraudulent",
  "do_not_honor",
  "revocation_of_all_authorizations",
  "security_violation",
]);

export function isHardDecline(declineCode: string | null | undefined): boolean {
  return !!declineCode && HARD_DECLINES.has(declineCode);
}
