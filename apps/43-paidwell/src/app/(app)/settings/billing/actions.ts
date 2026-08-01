"use server";

import { redirect } from "next/navigation";
import { requireFirm } from "@/lib/auth";
import { env } from "@/lib/env";
import { PLAN_ORDER } from "@/lib/plans";
import {
  createBillingPortalSession,
  createCheckoutSession,
  createConnectOnboardingLink,
  stripeConfigured,
} from "@/lib/stripe";
import type { Plan } from "@/db/schema";
import { getDb } from "@/db";
import { firms } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface BillingState {
  error?: string;
  notice?: string;
}

export async function startCheckoutAction(
  _prev: BillingState,
  formData: FormData,
): Promise<BillingState> {
  const { firm, user } = await requireFirm();
  const planId = String(formData.get("plan") ?? "") as Plan;
  if (!PLAN_ORDER.includes(planId)) return { error: "Pick a plan." };
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this deployment, so checkout cannot open." };
  }

  let url: string | null = null;
  try {
    const session = await createCheckoutSession({
      firmId: firm.id,
      firmName: firm.name,
      planId,
      email: user.email,
      customerId: firm.stripeCustomerId,
      successUrl: `${env.appUrl}/settings/billing?checkout=done`,
      cancelUrl: `${env.appUrl}/settings/billing`,
    });
    url = session.url ?? null;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the checkout session." };
  }
  if (!url) return { error: "Stripe did not return a checkout URL." };
  redirect(url);
}

export async function openBillingPortalAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const { firm } = await requireFirm();
  if (!firm.stripeCustomerId) return { error: "There is no subscription to manage yet." };
  if (!stripeConfigured()) return { error: "Stripe is not configured on this deployment." };
  let url: string;
  try {
    const session = await createBillingPortalSession(
      firm.stripeCustomerId,
      `${env.appUrl}/settings/billing`,
    );
    url = session.url;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the portal session." };
  }
  redirect(url);
}

/**
 * Connect Standard onboarding. Portal payments land in the firm's own Stripe
 * account — we never hold their money and never take a cut.
 */
export async function connectStripeAction(
  _prev: BillingState,
  _formData: FormData,
): Promise<BillingState> {
  const { firm, user } = await requireFirm();
  if (!stripeConfigured()) {
    return {
      error:
        "Stripe is not configured on this deployment, so the payment portal cannot take card or ACH payments yet. Everything else works.",
    };
  }
  let url: string;
  try {
    const link = await createConnectOnboardingLink({
      firmId: firm.id,
      email: user.email,
      existingAccountId: firm.stripeAccountId,
      refreshUrl: `${env.appUrl}/settings/billing`,
      returnUrl: `${env.appUrl}/settings/billing?connect=done`,
    });
    const db = getDb();
    await db
      .update(firms)
      .set({ stripeAccountId: link.accountId, updatedAt: new Date() })
      .where(eq(firms.id, firm.id));
    url = link.url;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Stripe refused the account link." };
  }
  redirect(url);
}
