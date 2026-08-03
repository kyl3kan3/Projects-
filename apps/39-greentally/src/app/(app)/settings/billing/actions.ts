"use server";

import { redirect } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { env } from "@/lib/env";
import { isRedirectError, safeMessage } from "@/lib/errors";
import { createCheckoutSession, createPortalSession } from "@/lib/stripe";
import type { BillingInterval, Plan } from "@/db/schema";
import { PAID_PLANS } from "@/lib/plans";

export interface BillingState {
  error?: string;
}

export async function startCheckout(_prev: BillingState, form: FormData): Promise<BillingState> {
  let url: string;
  try {
    const { user, org } = await requireOnboarded();
    const planRaw = String(form.get("plan") ?? "");
    const plan = (PAID_PLANS as string[]).includes(planRaw) ? (planRaw as Plan) : "starter";
    const interval: BillingInterval = String(form.get("interval") ?? "month") === "year" ? "year" : "month";

    url = await createCheckoutSession({
      org,
      plan,
      interval,
      email: user.email,
      successUrl: `${env.appUrl}/settings/billing?checkout=done`,
      cancelUrl: `${env.appUrl}/settings/billing?checkout=cancelled`,
    });
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not start checkout.") };
  }
  redirect(url);
}

export async function openPortal(_prev: BillingState, _form: FormData): Promise<BillingState> {
  let url: string;
  try {
    const { org } = await requireOnboarded();
    url = await createPortalSession(org, `${env.appUrl}/settings/billing`);
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not open the billing portal.") };
  }
  redirect(url);
}
