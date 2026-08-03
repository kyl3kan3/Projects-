"use server";

import { redirect } from "next/navigation";
import { failed, field, type FormState } from "@/lib/forms";
import { claimOffer } from "@/server/waitlist";

export type ClaimValues = { token: string };

/**
 * Claim an offered slot — a POST, always.
 *
 * The atomic flip lives in `claimOffer`: one UPDATE guarded by `status = 'offered'` and the
 * token hash. Two people tapping in the same second produce one winner and one calm "just
 * missed it", and the loser stays on the waitlist.
 */
export async function claimAction(
  _prev: FormState<ClaimValues>,
  formData: FormData,
): Promise<FormState<ClaimValues>> {
  const values: ClaimValues = { token: field(formData, "token") };
  const result = await claimOffer(values.token);
  if (!result.ok) {
    if (result.reason === "missed" || result.reason === "slot_taken") {
      redirect(`/w/${values.token}?missed=1`);
    }
    return failed(result.message, values);
  }
  redirect(`/w/${values.token}`);
}
