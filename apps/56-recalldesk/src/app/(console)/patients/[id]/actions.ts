"use server";

/**
 * Patient-record actions: the recall interval, the contact flags, do-not-contact,
 * and recording a booking the front desk took over the phone.
 *
 * Consent changes are audit-logged without exception, and an opt-out set here is
 * the same permanent, per-channel opt-out a STOP reply produces — there is one
 * function for it (server/campaigns.optOutPatient), not two.
 */

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { patients } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fromDayString } from "@/lib/dates";
import { optOutPatient, stopEnrollmentsFor } from "@/server/campaigns";
import { audit } from "@/server/audit";
import { recomputeOverdue } from "@/server/overdue";
import { recordBooking } from "@/server/queue";

export interface PatientState {
  error: string | null;
  saved?: boolean;
}

async function ownedPatient(patientId: string) {
  const ctx = await requireUser();
  const db = getDb();
  const [patient] = await db.select().from(patients).where(eq(patients.id, patientId));
  if (!patient || !ctx.locations.some((l) => l.id === patient.locationId)) {
    throw new Error("That patient is not in your practice.");
  }
  return { ctx, patient };
}

export async function updatePatientAction(
  _prev: PatientState,
  formData: FormData,
): Promise<PatientState> {
  const patientId = String(formData.get("patientId") ?? "");
  try {
    const { ctx, patient } = await ownedPatient(patientId);
    const interval = Number(formData.get("recallIntervalMonths") ?? patient.recallIntervalMonths);
    if (!Number.isInteger(interval) || interval < 1 || interval > 24) {
      return { error: "A recall interval is between 1 and 24 months." };
    }

    const wantsEmail = formData.get("emailConsent") === "on";
    const wantsSms = formData.get("smsConsent") === "on";

    // Granting consent is allowed; an opt-out is never undone from this screen —
    // that would let the office silently re-subscribe someone who said stop.
    await getDb()
      .update(patients)
      .set({
        recallIntervalMonths: interval,
        emailConsent: patient.emailOptedOutAt ? false : wantsEmail,
        smsConsent: patient.smsOptedOutAt ? false : wantsSms,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, patient.id));

    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "patient.updated",
      target: `patient:${patient.id}`,
      metadata: {
        recallIntervalMonths: interval,
        emailConsent: patient.emailOptedOutAt ? false : wantsEmail,
        smsConsent: patient.smsOptedOutAt ? false : wantsSms,
      },
    });

    if (interval !== patient.recallIntervalMonths) {
      await recomputeOverdue({ locationId: patient.locationId });
    }

    revalidatePath(`/patients/${patient.id}`);
    revalidatePath("/overdue");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save that." };
  }
}

export async function optOutAction(_prev: PatientState, formData: FormData): Promise<PatientState> {
  const patientId = String(formData.get("patientId") ?? "");
  const channel = String(formData.get("channel") ?? "") === "sms" ? "sms" : "email";
  try {
    const { ctx, patient } = await ownedPatient(patientId);
    await optOutPatient({ patientId: patient.id, channel });
    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "consent.opt_out",
      target: `patient:${patient.id}`,
      metadata: { channel, source: "patient_screen" },
    });
    revalidatePath(`/patients/${patient.id}`);
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record that opt-out." };
  }
}

export async function doNotContactAction(
  _prev: PatientState,
  formData: FormData,
): Promise<PatientState> {
  const patientId = String(formData.get("patientId") ?? "");
  const on = String(formData.get("on") ?? "1") === "1";
  try {
    const { ctx, patient } = await ownedPatient(patientId);
    await getDb()
      .update(patients)
      .set({ doNotContact: on, updatedAt: new Date() })
      .where(eq(patients.id, patient.id));
    if (on) await stopEnrollmentsFor({ patientId: patient.id, reason: "manual" });
    await audit({
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      action: "consent.do_not_contact",
      target: `patient:${patient.id}`,
      metadata: { doNotContact: on, source: "patient_screen" },
    });
    revalidatePath(`/patients/${patient.id}`);
    revalidatePath("/overdue");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not change that flag." };
  }
}

/** A booking taken however it was taken — the ledger decides if it counts. */
export async function recordBookingAction(
  _prev: PatientState,
  formData: FormData,
): Promise<PatientState> {
  const patientId = String(formData.get("patientId") ?? "");
  const raw = String(formData.get("appointmentOn") ?? "").trim();
  const appointmentOn = raw ? fromDayString(raw) : null;
  if (raw && !appointmentOn) return { error: "That appointment date could not be read." };

  try {
    const { ctx, patient } = await ownedPatient(patientId);
    await recordBooking({
      patientId: patient.id,
      locationId: patient.locationId,
      practiceId: ctx.practice.id,
      source: "front_desk_manual",
      appointmentOn,
      recordedBy: ctx.user.id,
    });
    revalidatePath(`/patients/${patient.id}`);
    revalidatePath("/ledger");
    revalidatePath("/dashboard");
    return { error: null, saved: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not record that booking." };
  }
}
