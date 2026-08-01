"use server";

/**
 * Two billing endpoints. Both return a URL rather than redirecting, so the client
 * can show Stripe's refusal in place instead of navigating to an error page.
 */

import { requireRole } from "@/lib/auth";
import { BillingError, createBillingPortalSession, createCheckoutSession } from "@/lib/stripe";
import type { Plan } from "@/db/schema";

export interface BillingResult {
  url: string | null;
  error: string | null;
}

export async function openCheckoutAction(plan: Plan): Promise<BillingResult> {
  const { user, practice } = await requireRole(["owner"]);
  try {
    return { url: await createCheckoutSession(practice, user.email, plan), error: null };
  } catch (err) {
    if (err instanceof BillingError) return { url: null, error: err.message };
    console.error("[billing] checkout failed", err);
    return { url: null, error: "Could not start checkout. Try again." };
  }
}

export async function openPortalAction(): Promise<BillingResult> {
  const { practice } = await requireRole(["owner"]);
  try {
    return { url: await createBillingPortalSession(practice), error: null };
  } catch (err) {
    if (err instanceof BillingError) return { url: null, error: err.message };
    console.error("[billing] portal failed", err);
    return { url: null, error: "Could not open the billing portal. Try again." };
  }
}
