"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import type { PlanId } from "@/db/schema";

export interface BillingState {
  error?: string;
}

export async function upgradeAction(
  planId: Exclude<PlanId, "free">,
  _prev: BillingState,
): Promise<BillingState> {
  const user = await requireUser();
  let url: string;
  try {
    url = await createCheckoutSession(user, planId);
  } catch (err) {
    // The most likely cause is Stripe not being configured, and the honest
    // message says so rather than "something went wrong".
    return {
      error:
        err instanceof Error
          ? err.message
          : "Could not start checkout — billing isn't configured on this deployment.",
    };
  }
  redirect(url);
}

export async function portalAction(_prev: BillingState): Promise<BillingState> {
  const user = await requireUser();
  let url: string;
  try {
    url = await createPortalSession(user);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not open the billing portal",
    };
  }
  redirect(url);
}
