"use server";

/**
 * Billing actions. Both of these hand off to Stripe-hosted pages: no card fields
 * ever touch this app, which is the only card-handling posture worth having.
 *
 * A missing price id or an unconfigured Stripe key surfaces as a message on the
 * page rather than an unhandled 500 — a firm that cannot upgrade needs to know
 * why, and "Something went wrong" is not why.
 */

import { requireAdmin } from "@/lib/auth";
import { PAID_PLANS } from "@/lib/plans";
import { createCheckoutSession, createPortalSession, type PaidPlan } from "@/lib/stripe";

export interface BillingState {
  error: string | null;
  /** Stripe-hosted URL for the client to follow. */
  url: string | null;
}

export async function checkoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { firm } = await requireAdmin();
  const requested = String(formData.get("plan") ?? "");
  if (!(PAID_PLANS as readonly string[]).includes(requested)) {
    return { error: "Pick one of the three plans.", url: null };
  }
  try {
    const { url } = await createCheckoutSession(firm, requested as PaidPlan);
    return { error: null, url };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not start checkout.",
      url: null,
    };
  }
}

export async function portalAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const { firm } = await requireAdmin();
  try {
    const { url } = await createPortalSession(firm);
    return { error: null, url };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not open the billing portal.",
      url: null,
    };
  }
}
