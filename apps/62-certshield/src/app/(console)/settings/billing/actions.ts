"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { stripeConfigured } from "@/lib/env";
import type { PlanId } from "@/db/schema";

export interface BillingState {
  error: string | null;
}

export async function startCheckoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const plan = String(formData.get("plan") ?? "") as Exclude<PlanId, "trial">;
  let url: string;
  try {
    const { user, org } = await requireAdmin();
    if (!stripeConfigured()) {
      throw new Error(
        "Stripe is not configured in this deployment, so checkout cannot open. Everything else works.",
      );
    }
    if (!["ledger", "portfolio", "enterprise"].includes(plan)) {
      throw new Error("Pick one of the three plans.");
    }
    url = await createCheckoutSession(org, user.email, plan);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open checkout." };
  }
  redirect(url);
}

export async function openPortalAction(_prev: BillingState): Promise<BillingState> {
  let url: string;
  try {
    const { user, org } = await requireAdmin();
    if (!stripeConfigured()) {
      throw new Error("Stripe is not configured in this deployment, so the portal cannot open.");
    }
    if (!org.stripeCustomerId) {
      throw new Error("There is no Stripe customer yet — subscribe to a plan first.");
    }
    url = await createPortalSession(org, user.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the billing portal." };
  }
  redirect(url);
}
