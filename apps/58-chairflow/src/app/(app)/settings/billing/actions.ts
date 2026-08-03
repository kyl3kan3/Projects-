"use server";

import { redirect } from "next/navigation";
import { requireStylist } from "@/lib/auth";
import { failed, field, type FormState } from "@/lib/forms";
import type { BillablePlan } from "@/lib/plans";
import { openPortal, startCheckout } from "@/server/billing";

export type BillingValues = Record<string, string>;

/**
 * Start a subscription, or open the customer portal.
 *
 * Both are POSTs rather than links. `next/link` prefetches on hover, so a GET that created a
 * Stripe session would create one every time somebody's thumb passed over the button — and
 * in one app in this portfolio, merely opening a screen wrote a phantom row for exactly that
 * reason.
 *
 * When Stripe is not configured the reason is returned and rendered, rather than the screen
 * pretending checkout is one tap away.
 */
export async function startCheckoutAction(
  _prev: FormState<BillingValues>,
  formData: FormData,
): Promise<FormState<BillingValues>> {
  const { user, stylist } = await requireStylist();
  const plan = field(formData, "plan") as BillablePlan;
  if (plan !== "chair" && plan !== "book" && plan !== "shop") {
    return failed("Pick one of the three plans.", {});
  }
  const result = await startCheckout({ stylist, email: user.email, plan });
  if (!result.ok) return failed(result.reason, {});
  redirect(result.url);
}

export async function openPortalAction(
  _prev: FormState<BillingValues>,
  formData: FormData,
): Promise<FormState<BillingValues>> {
  void formData;
  const { stylist } = await requireStylist();
  const result = await openPortal(stylist);
  if (!result.ok) return failed(result.reason, {});
  redirect(result.url);
}
