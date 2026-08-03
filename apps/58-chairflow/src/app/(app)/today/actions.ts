"use server";

import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { appointmentBundle, cancelAppointment, markOutcome, waiveFee } from "@/server/appointments";
import { offerFreedSlot } from "@/server/waitlist";
import type { MarkResult, Verdict } from "@/server/appointments";

/**
 * The stylist's verdict, and the two money actions that follow from it.
 *
 * Marking is where the product earns its keep, so the result comes back in full — the
 * arithmetic, the deposit applied, whether the card took it — because the screen has to
 * show the client what happened rather than just refreshing.
 */
export interface MarkState {
  error: string | null;
  appointmentId: string | null;
  result: MarkResult | null;
}

export async function markAppointment(
  _prev: MarkState,
  formData: FormData,
): Promise<MarkState> {
  const { user, stylist } = await requireStylist();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const verdict = String(formData.get("verdict") ?? "") as Verdict;

  if (!["completed", "no_show", "grace"].includes(verdict)) {
    return { error: "Pick one of the three outcomes.", appointmentId, result: null };
  }

  const bundle = await appointmentBundle(appointmentId);
  if (!bundle || bundle.stylist.id !== stylist.id) {
    return { error: "That appointment is not on your book.", appointmentId, result: null };
  }

  const marked = await markOutcome({
    appointmentId,
    verdict,
    actor: { kind: "user", userId: user.id },
  });
  if (!marked.ok) return { error: marked.message, appointmentId, result: null };

  revalidatePath("/today");
  revalidatePath("/ledger");
  return { error: null, appointmentId, result: marked.result };
}

export interface SimpleState {
  error: string | null;
  notice: string | null;
}

export async function waiveChargeAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const { user, stylist } = await requireStylist();
  const chargeId = String(formData.get("chargeId") ?? "");
  const result = await waiveFee({ chargeId, userId: user.id, stylistId: stylist.id });
  if (!result.ok) return { error: result.message, notice: null };
  revalidatePath("/today");
  revalidatePath("/ledger");
  return { error: null, notice: "Waived. The client keeps their card on file." };
}

/**
 * Cancel from the stylist's side, then offer the freed hour to the waitlist.
 *
 * The offer is attempted immediately rather than waiting for the next tick: a slot freed
 * at 4pm for a 6pm appointment is only worth offering right now.
 */
export async function cancelAppointmentAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const { user, stylist } = await requireStylist();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const bundle = await appointmentBundle(appointmentId);
  if (!bundle || bundle.stylist.id !== stylist.id) {
    return { error: "That appointment is not on your book.", notice: null };
  }

  const result = await cancelAppointment({
    appointmentId,
    actor: { kind: "user", userId: user.id },
    byClient: false,
  });
  if (!result.ok) return { error: result.message, notice: null };

  let notice = "Cancelled.";
  if (result.outcome.freedSlot) {
    const offered = await offerFreedSlot({
      stylistId: stylist.id,
      serviceId: result.outcome.freedSlot.serviceId,
      startsAt: result.outcome.freedSlot.startsAt,
      endsAt: result.outcome.freedSlot.endsAt,
    });
    notice = offered.offered
      ? "Cancelled, and the slot has been offered to the waitlist."
      : `Cancelled. ${offered.reason ?? ""}`.trim();
  }
  revalidatePath("/today");
  revalidatePath("/ledger");
  return { error: null, notice };
}
