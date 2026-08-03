"use server";

import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { failed, field, succeeded, type FormState } from "@/lib/forms";
import { waiveFee } from "@/server/appointments";

export type WaiveValues = Record<string, string>;

/**
 * Waive a fee from the ledger.
 *
 * One tap, per DESIGN.md — grace should be easy while charging is hold-to-confirm. A fee
 * the card already paid is refused with a reason, because writing "waived" over collected
 * money would make the ledger claim a refund that never happened.
 */
export async function waiveFromLedgerAction(
  _prev: FormState<WaiveValues>,
  formData: FormData,
): Promise<FormState<WaiveValues>> {
  const { user, stylist } = await requireStylist();
  const chargeId = field(formData, "chargeId");
  const result = await waiveFee({ chargeId, userId: user.id, stylistId: stylist.id });
  if (!result.ok) return failed(result.message, {});
  revalidatePath("/ledger");
  revalidatePath("/today");
  return succeeded("Waived, and logged.", {});
}
