"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { CheckError, recordCheck } from "@/lib/checkin";
import { field, formError, formOk, intField, snapshot, type FormState } from "@/lib/form";
import { canWrite, entitlements } from "@/lib/plans";

/**
 * Record one line's condition, on either end of the rental.
 *
 * The counts have to add up to the line quantity — 38 of 40 chairs accounted for
 * is the shape of a damage argument three weeks later, so the action refuses it
 * rather than storing a partial answer.
 */
export async function recordCheckAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = snapshot(form);
  const orderId = field(form, "orderId");
  const direction = field(form, "direction") === "out" ? "out" : "in";
  try {
    const { account, user } = await requireSession();
    const gate = canWrite(entitlements(account));
    if (!gate.allowed) return formError(gate.reason ?? "This account is read-only.", values);

    const result = await recordCheck({
      accountId: account.id,
      orderId,
      orderLineId: field(form, "orderLineId"),
      direction,
      quantityOk: intField(form, "quantityOk", 0),
      quantityDamaged: intField(form, "quantityDamaged", 0),
      quantityMissing: intField(form, "quantityMissing", 0),
      note: field(form, "note") || null,
      userId: user.id,
      actor: user.email,
    });

    revalidatePath("/returns");
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/runs");

    const parts: string[] = [direction === "out" ? "Checked out." : "Checked in."];
    if (result.claimsDrafted > 0) {
      parts.push(
        `${result.claimsDrafted} claim${result.claimsDrafted === 1 ? "" : "s"} drafted from the fee schedule — nothing is charged until you settle.`,
      );
    }
    if (result.depositNote) parts.push(result.depositNote);
    return formOk(parts.join(" "), values);
  } catch (err) {
    if (err instanceof CheckError) return formError(err.message, values);
    return formError(err instanceof Error ? err.message : "Could not record the check.", values);
  }
}
