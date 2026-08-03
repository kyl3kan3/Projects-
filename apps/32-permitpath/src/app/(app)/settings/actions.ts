"use server";

/**
 * Settings and billing actions.
 *
 * Checkout and the portal both need a live Stripe key; without one they return a
 * plain message rather than throwing a stack trace at a contractor. That is also
 * what the billing screen renders when billing is unconfigured — the two agree.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSession, requireUser } from "@/lib/auth";
import {
  applyContributionCredit,
  createBillingPortalSession,
  createCheckoutSession,
} from "@/lib/billing";
import { billingConfigured } from "@/lib/env";
import { safeMessage } from "@/lib/errors";
import { applicableCredit, PLAN_ORDER } from "@/lib/plans";
import type { Plan, PlanInterval } from "@/db/schema";

export interface BillingState {
  error: string | null;
  ok: string | null;
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}

export async function startCheckoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { user, org } = await requireUser();
  if (!billingConfigured()) {
    return { error: "Billing is not configured on this deployment.", ok: null };
  }

  const plan = String(formData.get("plan") ?? "") as Plan;
  if (!PLAN_ORDER.includes(plan)) return { error: "Choose a plan.", ok: null };
  const interval: PlanInterval = String(formData.get("interval") ?? "month") === "year" ? "year" : "month";

  let url: string;
  try {
    url = await createCheckoutSession({ org, email: user.email, plan, interval });
  } catch (err) {
    return { error: safeMessage(err, "Checkout could not be started."), ok: null };
  }
  redirect(url);
}

export async function openBillingPortalAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const { user, org } = await requireUser();
  if (!billingConfigured()) {
    return { error: "Billing is not configured on this deployment.", ok: null };
  }
  let url: string;
  try {
    url = await createBillingPortalSession(org, user.email);
  } catch (err) {
    return { error: safeMessage(err, "The billing portal could not be opened."), ok: null };
  }
  redirect(url);
}

/** Move applicable contribution credit onto the Stripe customer balance. */
export async function applyCreditAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const { user, org } = await requireUser();
  if (!billingConfigured()) {
    return { error: "Billing is not configured on this deployment.", ok: null };
  }

  const { appliedCents } = applicableCredit(org.contributionCreditCents, org.plan, org.planInterval);
  if (appliedCents <= 0) {
    return { error: "There is no credit to apply to the next invoice.", ok: null };
  }

  try {
    await applyContributionCredit({
      org,
      email: user.email,
      cents: appliedCents,
      actorUserId: user.id,
    });
  } catch (err) {
    return { error: safeMessage(err, "That credit could not be applied."), ok: null };
  }

  revalidatePath("/settings/billing");
  return { error: null, ok: "Credit applied to your Stripe balance — it lands on the next invoice." };
}
