"use server";

/**
 * Billing actions.
 *
 * `startCheckoutAction` is the only path to a review credit in production. The dev grant
 * exists so the pipeline can be exercised locally with no Stripe key, and it is gated on
 * *both* NODE_ENV not being production *and* no Stripe key being configured — an
 * unconfigured production deploy must not hand out free reviews.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  BillingError,
  chargeOverage,
  createOneTimeCheckout,
  createSubscriptionCheckout,
  grantCredits,
} from "@/lib/billing";
import { devCreditsAllowed } from "@/lib/env";
import type { Plan } from "@/db/schema";
import { PLANS } from "@/lib/plans";

export interface CheckoutState {
  error: string | null;
}

export async function startCheckoutAction(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const { user, account } = await requireUser();
  const plan = String(formData.get("plan") ?? "per_contract") as Plan;
  let url: string;
  try {
    url =
      plan === "per_contract"
        ? await createOneTimeCheckout(account.id, user.email, "/settings/billing")
        : await createSubscriptionCheckout(
            account.id,
            user.email,
            plan as Exclude<Plan, "per_contract">,
            "/settings/billing",
          );
  } catch (err) {
    if (err instanceof BillingError) return { error: err.message };
    console.error("[billing] checkout failed", err);
    return { error: "Checkout could not be opened. Try again in a moment." };
  }
  redirect(url);
}

/** Buy one extra review at the overage price, after an explicit confirmation. */
export async function buyOverageAction(): Promise<CheckoutState> {
  const { account } = await requireUser();
  if (PLANS[account.plan].monthlyCredits === 0) {
    return { error: "Extra reviews at the overage price are for subscribers." };
  }
  try {
    await chargeOverage(account.id, account.stripeCustomerId);
  } catch (err) {
    if (err instanceof BillingError) return { error: err.message };
    console.error("[billing] overage failed", err);
    return { error: "That extra review could not be billed." };
  }
  revalidatePath("/settings/billing");
  return { error: null };
}

/**
 * Simulate a completed $19 checkout so the pipeline can be run without Stripe. Refused
 * unless the deployment has opted in with ALLOW_DEV_CREDITS=1 *and* has no Stripe key.
 */
export async function devGrantCreditAction(): Promise<CheckoutState> {
  const { account } = await requireUser();
  if (!devCreditsAllowed()) {
    return { error: "Not available on this deployment." };
  }
  await grantCredits({
    accountId: account.id,
    kind: "one_time",
    credits: 1,
    amountCents: PLANS.per_contract.perContractCents,
    stripeRef: `dev-${account.id}-${Date.now()}`,
    note: "Simulated $19 checkout (development only)",
  });
  revalidatePath("/settings/billing");
  revalidatePath("/contracts/new");
  return { error: null };
}
