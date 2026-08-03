"use server";

/**
 * Billing actions. Both are thin: Stripe hosts the checkout and the portal, so
 * the only job here is minting the right URL for this practice and refusing
 * politely when Stripe is not configured.
 */

import { redirect } from "next/navigation";
import { requirePractice } from "@/lib/auth";
import { checkoutUrl, portalUrl, stripeConfigured } from "@/lib/billing";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { requestMeta } from "@/lib/request";
import type { Plan } from "@/db/schema";

export interface BillingState {
  error?: string;
}

export async function startCheckoutAction(
  _prev: BillingState,
  form: FormData,
): Promise<BillingState> {
  const { practice, user } = await requirePractice();
  if (!stripeConfigured()) {
    return {
      error:
        "Stripe is not configured on this install, so checkout cannot open. Your notes and exports are unaffected.",
    };
  }
  const plan = String(form.get("plan") ?? "") as Plan;
  if (!["solo", "caseload", "group"].includes(plan)) {
    return { error: "Choose a plan." };
  }

  let url: string;
  try {
    url = await checkoutUrl(practice, plan, {
      email: user.email,
      successUrl: `${env.appUrl}/settings/billing?checkout=done`,
      cancelUrl: `${env.appUrl}/settings/billing`,
    });
  } catch (err) {
    console.error("[billing] checkout failed", err);
    return { error: "Could not open checkout. Try again in a moment." };
  }

  const meta = await requestMeta();
  await recordAudit({
    practiceId: practice.id,
    actorId: user.id,
    action: "billing_changed",
    targetKind: "practice",
    targetId: practice.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { plan, reason: "checkout_opened" },
  });

  redirect(url);
}

export async function openPortalAction(): Promise<BillingState> {
  const { practice } = await requirePractice();
  if (!stripeConfigured()) {
    return { error: "Stripe is not configured on this install." };
  }
  let url: string;
  try {
    url = await portalUrl(practice, `${env.appUrl}/settings/billing`);
  } catch (err) {
    console.error("[billing] portal failed", err);
    return {
      error:
        "There is no Stripe customer for this practice yet — start a plan first.",
    };
  }
  redirect(url);
}
