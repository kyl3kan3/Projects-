"use server";

import { revalidatePath } from "next/cache";
import { requireStylist } from "@/lib/auth";
import { appointmentBundle, cancelAppointment, markOutcome, waiveFee } from "@/server/appointments";
import { offerFreedSlot } from "@/server/waitlist";
import { ledgerRows } from "@/server/ledger";
import { summarizeLedger, summarySentence } from "@/lib/ledger";
import type { MarkResult, Verdict } from "@/server/appointments";

/**
 * The stylist's verdict, and the two money actions that follow from it.
 *
 * The result comes back in full — the arithmetic, the deposit applied, whether the card took
 * it, and the month's new protected total — because the screen has to *show* what happened.
 * That is the product's signature: the slot flips, the maths writes itself, the ledger line
 * lands, the counter settles.
 *
 * Note what is deliberately **not** here: any `revalidatePath` at all. `revalidatePath` from a
 * server action invalidates the client router cache and refreshes the *current* route whatever
 * path is passed to it — so this screen re-renders, the marked appointment is no longer
 * awaiting a verdict, and the component that would have shown all four beats unmounts before
 * any of them play. The card simply vanishes and the fee lands invisibly, which is exactly the
 * moment the product is built around. The client component owns that moment and its "Done"
 * button calls `router.refresh()` once the stylist has seen it; `/ledger` and the client card
 * are dynamic routes, so they re-render on navigation anyway.
 */
export interface MarkState {
  error: string | null;
  appointmentId: string | null;
  result: MarkResult | null;
  /** The month's protected total after this verdict — beat four's number. */
  protectedCents: number | null;
  protectedHint: string | null;
}

export async function markAppointment(
  _prev: MarkState,
  formData: FormData,
): Promise<MarkState> {
  const { user, stylist } = await requireStylist();
  const appointmentId = String(formData.get("appointmentId") ?? "");
  const verdict = String(formData.get("verdict") ?? "") as Verdict;
  const blank = { appointmentId, result: null, protectedCents: null, protectedHint: null };

  if (!["completed", "no_show", "grace", "no_show_waived"].includes(verdict)) {
    return { error: "Pick one of the three outcomes.", ...blank };
  }

  const bundle = await appointmentBundle(appointmentId);
  if (!bundle || bundle.stylist.id !== stylist.id) {
    return { error: "That appointment is not on your book.", ...blank };
  }

  const marked = await markOutcome({
    appointmentId,
    verdict,
    actor: { kind: "user", userId: user.id },
  });
  if (!marked.ok) return { error: marked.message, ...blank };

  const summary = summarizeLedger(
    await ledgerRows({ stylistId: stylist.id, timezone: stylist.timezone }),
  );

  return {
    error: null,
    appointmentId,
    result: marked.result,
    protectedCents: summary.protectedCents,
    protectedHint: summarySentence(summary),
  };
}

export interface SimpleState {
  error: string | null;
  notice: string | null;
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
