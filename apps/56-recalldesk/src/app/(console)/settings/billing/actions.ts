"use server";

import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { PLANS, type Plan } from "@/lib/plans";
import { checkoutUrl, portalUrl } from "@/server/billing";

export interface BillingState {
  error: string | null;
}

export async function startCheckoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const raw = String(formData.get("plan") ?? "");
  if (!PLANS.includes(raw as Plan)) return { error: "Unknown plan." };

  let url: string;
  // Inside the try: only the owner may buy, and a denial is a sentence.
  try {
    const ctx = await requireRole("owner");
    url = await checkoutUrl({ practice: ctx.practice, plan: raw as Plan, userEmail: ctx.user.email });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not start checkout." };
  }
  redirect(url);
}

export async function openPortalAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  let url: string;
  try {
    const ctx = await requireRole("owner");
    url = await portalUrl(ctx.practice);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not open the billing portal." };
  }
  redirect(url);
}
