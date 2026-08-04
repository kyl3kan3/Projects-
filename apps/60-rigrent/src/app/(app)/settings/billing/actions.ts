"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { billingConfigured, createCheckoutSession, createPortalSession } from "@/lib/billing";
import { field, formError, type FormState } from "@/lib/form";
import type { Plan } from "@/db/schema";

export async function checkoutAction(_prev: FormState, form: FormData): Promise<FormState> {
  let url: string;
  try {
    const { account, user } = await requireSession();
    if (user.role !== "owner") return formError("Only the owner can change the plan.");
    if (!billingConfigured()) {
      return formError(
        "Stripe is not configured in this environment, so checkout cannot open. Set STRIPE_SECRET_KEY and the three price ids in .env.local.",
      );
    }
    const plan = field(form, "plan") as Plan;
    if (plan !== "yard" && plan !== "fleet" && plan !== "pro") return formError("Pick a plan.");
    url = await createCheckoutSession(account.id, user.email, plan);
  } catch (err) {
    return formError(err instanceof Error ? err.message : "Could not open checkout.");
  }
  redirect(url);
}

export async function portalAction(): Promise<void> {
  const { account, user } = await requireSession();
  if (user.role !== "owner") redirect("/settings/billing?error=owner");
  if (!billingConfigured() || !account.stripeCustomerId) {
    redirect("/settings/billing?error=unconfigured");
  }
  const url = await createPortalSession(account.stripeCustomerId!);
  redirect(url);
}
