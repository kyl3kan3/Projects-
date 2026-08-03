"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { failed, succeeded, type FormState } from "@/lib/forms";
import { startConnectOnboarding } from "@/server/billing";

export type ConnectValues = Record<string, string>;

/**
 * Start Stripe Connect Express onboarding.
 *
 * A POST, because it creates a Stripe account on the first tap and `next/link` would prefetch
 * a GET on hover. When Stripe is unconfigured the simulated path says so plainly and marks
 * the account usable, so the money spine can still be exercised end to end — with every row
 * it produces flagged as recorded rather than charged.
 */
export async function connectStripeAction(
  _prev: FormState<ConnectValues>,
  formData: FormData,
): Promise<FormState<ConnectValues>> {
  void formData;
  const { user, stylist } = await requireStylist();
  let outcome;
  try {
    outcome = await startConnectOnboarding(stylist, user.email);
  } catch (err) {
    return failed(
      err instanceof Error ? err.message : "Stripe would not start onboarding.",
      {},
    );
  }
  if (outcome.url) redirect(outcome.url);
  revalidatePath("/setup");
  revalidatePath("/page");
  return succeeded(outcome.message, {});
}
