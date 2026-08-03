"use server";

/**
 * Billing actions. Both redirect to Stripe; neither one changes the plan
 * locally — the webhook is the only thing that writes `companies.plan`, so a
 * customer who abandons checkout is not left on a tier they did not buy.
 */

import { redirect } from "next/navigation";
import { requireWriter } from "@/lib/auth";
import { billingConfigured, createBillingPortalSession, createCheckoutSession } from "@/lib/billing";
import type { Plan } from "@/db/schema";
import type { ActionState } from "@/lib/action-state";

export async function startCheckoutAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  let url: string;
  try {
    const { company, user } = await requireWriter();
    if (!billingConfigured()) {
      return {
        error:
          "Stripe is not configured on this deployment. Set STRIPE_SECRET_KEY and the three price ids, then reload.",
        message: null,
      };
    }
    const plan = String(form.get("plan") ?? "") as Plan;
    if (!["crew", "company", "fleet"].includes(plan)) {
      return { error: "Pick a plan", message: null };
    }
    url = await createCheckoutSession(company, plan, user.email);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not start checkout",
      message: null,
    };
  }
  redirect(url);
}

export async function openPortalAction(_prev: ActionState): Promise<ActionState> {
  let url: string;
  try {
    const { company } = await requireWriter();
    if (!billingConfigured()) {
      return { error: "Stripe is not configured on this deployment.", message: null };
    }
    url = await createBillingPortalSession(company);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not open the billing portal",
      message: null,
    };
  }
  redirect(url);
}
