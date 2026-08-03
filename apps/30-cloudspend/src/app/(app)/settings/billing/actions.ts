"use server";

/**
 * Two billing endpoints: start a Checkout session for a tier, or open the Stripe
 * billing portal. Nothing here changes the org's plan — only the verified webhook
 * does that, because a redirect back from Checkout is not proof of payment.
 */

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { createCheckout, createPortalSession } from "@/lib/billing";
import { PLAN_IDS, type PlanId } from "@/db/schema";

export interface BillingState {
  error?: string;
}

export async function checkoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { org } = await requireOrg();
  const planId = String(formData.get("plan") ?? "") as PlanId;
  if (!PLAN_IDS.includes(planId)) return { error: "Unknown plan" };
  const result = await createCheckout(org, planId);
  if (result.error || !result.url) {
    return { error: result.error ?? "Stripe did not return a checkout URL" };
  }
  redirect(result.url);
}

export async function portalAction(_prev: BillingState): Promise<BillingState> {
  const { org } = await requireOrg();
  const result = await createPortalSession(org);
  if (result.error || !result.url) {
    return { error: result.error ?? "Stripe did not return a portal URL" };
  }
  redirect(result.url);
}
