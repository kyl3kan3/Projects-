"use server";

/**
 * Billing actions. Both need a Stripe key; both say so plainly when there isn't
 * one, rather than failing with a stack trace or — worse — pretending a plan
 * changed.
 */

import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import {
  billingConfigured,
  createCheckoutSession,
  createPortalSession,
  priceIdFor,
} from "@/lib/billing";
import { field, formError, type FormState } from "@/lib/form";
import { PAID_PLANS } from "@/lib/plans";
import type { Plan } from "@/db/schema";

export async function startCheckoutAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { owner } = await requireOwner();
  const plan = field(form, "plan") as Plan;
  if (!PAID_PLANS.includes(plan)) return formError("Pick a plan");
  if (!billingConfigured()) {
    return formError(
      "Checkout needs STRIPE_SECRET_KEY and the three price ids in the environment. Nothing has been charged.",
    );
  }
  if (!priceIdFor(plan)) {
    return formError(`No Stripe price id is configured for the ${plan} plan.`);
  }

  let url: string;
  try {
    url = await createCheckoutSession(owner.id, owner.email, plan);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Stripe would not start a checkout");
  }
  redirect(url);
}

export async function openPortalAction(): Promise<FormState> {
  const { owner } = await requireOwner();
  if (!billingConfigured()) {
    return formError("The billing portal needs STRIPE_SECRET_KEY in the environment.");
  }
  if (!owner.stripeCustomerId) {
    return formError("No Stripe customer yet — start a plan first.");
  }
  let url: string;
  try {
    url = await createPortalSession(owner.stripeCustomerId);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Stripe would not open the portal");
  }
  redirect(url);
}
