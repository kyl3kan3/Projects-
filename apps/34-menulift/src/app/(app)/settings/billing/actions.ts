"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { env } from "@/lib/env";
import { isPlanId } from "@/lib/plans";
import type { BillingState } from "./state";

export async function startCheckoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const plan = String(formData.get("plan") ?? "");
  if (!isPlanId(plan)) return { error: "Pick a plan" };

  let url: string;
  try {
    const ctx = await requireUser();
    url = await createCheckoutSession({
      organizationId: ctx.organization.id,
      plan,
      email: ctx.user.email,
      successUrl: `${env.appUrl}/settings/billing?started=1`,
      cancelUrl: `${env.appUrl}/settings/billing`,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start checkout" };
  }
  redirect(url);
}

export async function openPortalAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  let url: string;
  try {
    const ctx = await requireUser();
    url = await createPortalSession(ctx.organization.id, `${env.appUrl}/settings/billing`);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the billing portal" };
  }
  redirect(url);
}
