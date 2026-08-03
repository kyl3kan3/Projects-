"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, type Plan } from "@/db/schema";
import { logAudit } from "@/lib/activity";
import { actorLabel, requireOwner } from "@/lib/auth";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { stripeConfigured } from "@/lib/env";
import { PAID_PLANS } from "@/lib/plans";

export interface BillingState {
  error: string | null;
}

export async function startCheckoutAction(_prev: BillingState, form: FormData): Promise<BillingState> {
  const { user, account } = await requireOwner();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this deployment, so checkout cannot open." };
  }
  const plan = String(form.get("plan") ?? "") as Plan;
  if (!PAID_PLANS.includes(plan)) return { error: "Pick one of the three plans." };

  let url: string;
  try {
    url = await createCheckoutSession({
      accountId: account.id,
      accountName: account.name,
      plan,
      email: user.email,
      existingCustomerId: account.stripeCustomerId,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe would not open a checkout." };
  }
  await logAudit({
    accountId: account.id,
    actor: actorLabel(user),
    action: "checkout_started",
    target: plan,
  });
  redirect(url);
}

export async function openPortalAction(_prev: BillingState): Promise<BillingState> {
  const { user, account } = await requireOwner();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this deployment." };
  }
  if (!account.stripeCustomerId) {
    return { error: "There is no Stripe customer on this desk yet — start a plan first." };
  }
  let url: string;
  try {
    url = await createPortalSession(account.stripeCustomerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe would not open the portal." };
  }
  await logAudit({
    accountId: account.id,
    actor: actorLabel(user),
    action: "portal_opened",
    target: account.stripeCustomerId,
  });
  redirect(url);
}

/**
 * The local escape hatch for a deployment with no Stripe keys: pick a plan
 * directly. Refuses outright when Stripe IS configured, so it can never be used
 * to dodge a real checkout in production.
 */
export async function setPlanWithoutStripeAction(
  _prev: BillingState,
  form: FormData,
): Promise<BillingState> {
  const { user, account } = await requireOwner();
  if (stripeConfigured()) {
    return { error: "Stripe is configured — use checkout." };
  }
  const plan = String(form.get("plan") ?? "") as Plan;
  if (!PAID_PLANS.includes(plan)) return { error: "Pick one of the three plans." };
  await getDb()
    .update(accounts)
    .set({ plan, trialEndsAt: null, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  await logAudit({
    accountId: account.id,
    actor: actorLabel(user),
    action: "plan_set_without_stripe",
    target: plan,
    metadata: { note: "No Stripe keys on this deployment" },
  });
  redirect("/settings/billing?plan=set");
}
