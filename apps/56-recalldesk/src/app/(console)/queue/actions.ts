"use server";

/**
 * Call-queue actions. The front desk owns this screen, so these are the only
 * actions in the console open to the `front_desk` role.
 */

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { visitValueCentsFor } from "@/lib/attribution";
import { fromDayString } from "@/lib/dates";
import { closeBookingRequest, disposition, queueDateFor, recordBooking, buildQueue, type Outcome } from "@/server/queue";

export interface QueueState {
  error: string | null;
  /** Set when a disposition just earned an attribution — the chair fills. */
  filled?: boolean;
}

const OUTCOMES: Outcome[] = ["booked", "left_message", "call_back", "skip", "do_not_contact"];

export async function dispositionAction(
  _prev: QueueState,
  formData: FormData,
): Promise<QueueState> {
  const ctx = await requireUser();
  const callTaskId = String(formData.get("callTaskId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  if (!OUTCOMES.includes(outcome as Outcome)) return { error: "Unknown outcome." };

  const rawDate = String(formData.get("appointmentOn") ?? "").trim();
  const appointmentOn = rawDate ? fromDayString(rawDate) : null;
  if (outcome === "booked" && rawDate && !appointmentOn) {
    return { error: "That appointment date could not be read. Use the date picker." };
  }

  try {
    const result = await disposition({
      callTaskId,
      locationIds: ctx.locations.map((l) => l.id),
      practiceId: ctx.practice.id,
      userId: ctx.user.id,
      outcome: outcome as Outcome,
      note: String(formData.get("note") ?? ""),
      appointmentOn,
    });
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    return { error: null, filled: result.attributed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save that outcome." };
  }
}

/** Front desk confirms a booking request they have just called back. */
export async function confirmRequestAction(
  _prev: QueueState,
  formData: FormData,
): Promise<QueueState> {
  const ctx = await requireUser();
  const requestId = String(formData.get("requestId") ?? "");
  const patientId = String(formData.get("patientId") ?? "");
  const rawDate = String(formData.get("appointmentOn") ?? "").trim();
  const appointmentOn = rawDate ? fromDayString(rawDate) : null;

  try {
    const result = await recordBooking({
      patientId,
      locationId: ctx.location.id,
      practiceId: ctx.practice.id,
      source: "booking_link",
      appointmentOn,
      recordedBy: ctx.user.id,
      bookingRequestId: requestId,
    });
    revalidatePath("/queue");
    revalidatePath("/dashboard");
    return { error: null, filled: result.attributed };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record that booking." };
  }
}

export async function dismissRequestAction(
  _prev: QueueState,
  formData: FormData,
): Promise<QueueState> {
  const ctx = await requireUser();
  try {
    await closeBookingRequest({
      requestId: String(formData.get("requestId") ?? ""),
      locationIds: ctx.locations.map((l) => l.id),
      status: "closed",
    });
    revalidatePath("/queue");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not close that request." };
  }
}

/** Rebuild today's ranking now — the pull-to-refresh equivalent. */
export async function rebuildQueueAction(
  _prev: QueueState,
  _formData: FormData,
): Promise<QueueState> {
  const ctx = await requireUser();
  try {
    await buildQueue({
      locationId: ctx.location.id,
      queueDate: queueDateFor(ctx.location.timezone),
      visitValueCents: visitValueCentsFor(ctx.practice.settings),
    });
    revalidatePath("/queue");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not rebuild the queue." };
  }
}
