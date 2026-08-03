"use server";

/**
 * Checkout and the billing portal. Two endpoints, both of which just hand back a Stripe
 * URL — plan changes only ever happen through the webhook, never from a redirect the
 * browser can be tricked into following.
 */

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isRedirectError, safeMessage } from "@/lib/errors";
import { createBillingPortalSession, createCheckoutSession } from "@/lib/stripe";
import { PLAN_ORDER } from "@/lib/plans";
import type { Plan } from "@/db/schema";

export interface BillingFormState {
  error: string | null;
}

export async function startCheckoutAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const { user, org } = await requireUser();
  const planId = String(formData.get("plan") ?? "");
  if (!(PLAN_ORDER as string[]).includes(planId)) return { error: "Pick one of the three plans." };
  let url: string;
  try {
    url = await createCheckoutSession(org, user.email, planId as Plan);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Checkout could not be started.") };
  }
  redirect(url);
}

export async function openBillingPortalAction(
  _prev: BillingFormState,
  _formData: FormData,
): Promise<BillingFormState> {
  const { user, org } = await requireUser();
  let url: string;
  try {
    url = await createBillingPortalSession(org, user.email);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "The billing portal could not be opened.") };
  }
  redirect(url);
}
