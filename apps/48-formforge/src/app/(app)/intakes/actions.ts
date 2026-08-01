"use server";

/**
 * Practice-side intake actions. Four, and every one of them is called from a form
 * in this route group — an exported `"use server"` function nothing calls is
 * attack surface, not dead code.
 *
 * The plan gate is re-checked here, not just in the UI: a disabled button is a
 * courtesy, and the server is where "you are over your clinician cap" has to hold.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorFor, requireUser } from "@/lib/auth";
import { clinicianCount } from "@/lib/practices";
import { latestVersion } from "@/lib/forms";
import { sendGate } from "@/lib/plans";
import { getPatientIdentity, PatientError, upsertPatient } from "@/lib/patients";
import { assignIntake, IntakeError, getIntake, reissueToken, sendIntake } from "@/lib/intakes";
import { sendEmail, sendSms } from "@/lib/delivery";
import { intakeInviteEmail, intakeReminderSms, intakeUrl } from "@/lib/messages";
import { env } from "@/lib/env";
import { clientIp } from "@/lib/request";
import { cancelReminders } from "@/lib/reminders";
import { appendAuditEvent } from "@/lib/audit";

export interface SendIntakeState {
  error: string | null;
}

export async function sendIntakeAction(
  _prev: SendIntakeState,
  formData: FormData,
): Promise<SendIntakeState> {
  const { user, practice } = await requireUser();
  const ip = await clientIp();
  const actor = actorFor(user, ip);

  const gate = sendGate({
    plan: practice.plan,
    clinicians: await clinicianCount(practice.id),
    trialEndsAt: practice.trialEndsAt,
    subscriptionStatus: practice.subscriptionStatus,
  });
  if (!gate.canSend) return { error: gate.reason };

  const formId = String(formData.get("formId") ?? "");
  if (!formId) return { error: "Choose a packet to send" };
  const version = await latestVersion(practice.id, formId);
  if (!version) return { error: "That packet has no published version yet — publish it first." };

  const channelEmail = formData.get("channelEmail") === "on";
  const channelSms = formData.get("channelSms") === "on";
  if (!channelEmail && !channelSms) return { error: "Pick at least one way to reach them" };

  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  if (channelEmail && !email) return { error: "An email address is needed to send by email" };
  if (channelSms && !phone) return { error: "A mobile number is needed to send by text" };

  let patientId: string;
  try {
    const { patient } = await upsertPatient(
      practice,
      {
        firstName: String(formData.get("firstName") ?? ""),
        lastName: String(formData.get("lastName") ?? ""),
        email: email || null,
        phone: phone || null,
        dob: String(formData.get("dob") ?? "") || null,
        assignedUserId: String(formData.get("assignedUserId") ?? "") || user.id,
      },
      actor,
    );
    patientId = patient.id;
  } catch (err) {
    if (err instanceof PatientError) return { error: err.message };
    console.error("[sendIntake] patient failed", err);
    return { error: "Could not save that patient. Check the details and try again." };
  }

  let result;
  try {
    result = await sendIntake({
      practice,
      patientId,
      formId,
      version,
      assignedUserId: String(formData.get("assignedUserId") ?? "") || user.id,
      channelEmail,
      channelSms,
      actor,
    });
  } catch (err) {
    if (err instanceof IntakeError) return { error: err.message };
    console.error("[sendIntake] failed", err);
    return { error: "Could not send that packet. Try again." };
  }

  // The raw token exists only here and in the message. Never logged, never stored.
  const url = intakeUrl(env.appUrl, result.rawToken);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const inputs = { firstName, practiceName: practice.name, url };

  if (channelEmail && email) {
    const delivery = await sendEmail(email, intakeInviteEmail(inputs));
    if (!delivery.ok) {
      console.error("[sendIntake] invite email failed", delivery.error);
    }
  }
  if (channelSms && phone) {
    const delivery = await sendSms(phone, intakeReminderSms(inputs));
    if (!delivery.ok) console.error("[sendIntake] invite sms failed", delivery.error);
  }

  revalidatePath("/intakes");
  redirect("/intakes?sent=1");
}

/** Re-issue a link for a patient who lost the email. Invalidates the old one. */
export async function resendLinkAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const intakeId = String(formData.get("intakeId") ?? "");
  const ip = await clientIp();
  const resolved = await getIntake(practice.id, intakeId);
  if (!resolved) return;

  const rawToken = await reissueToken(practice.id, intakeId, actorFor(user, ip));
  const identity = await getPatientIdentity(practice, resolved.intake.patientId, actorFor(user, ip));
  if (identity?.email) {
    await sendEmail(
      identity.email,
      intakeInviteEmail({
        firstName: identity.firstName,
        practiceName: practice.name,
        url: intakeUrl(env.appUrl, rawToken),
      }),
    );
  }
  revalidatePath(`/intakes/${intakeId}`);
}

/** Stop chasing a patient without touching the packet itself. */
export async function stopRemindersAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const intakeId = String(formData.get("intakeId") ?? "");
  const resolved = await getIntake(practice.id, intakeId);
  if (!resolved) return;
  const cancelled = await cancelReminders(intakeId, "completed");
  await appendAuditEvent({
    practiceId: practice.id,
    actorType: "user",
    actorId: user.id,
    actorLabel: actorFor(user).label,
    action: "edited",
    targetType: "intake",
    targetId: intakeId,
    targetLabel: "reminders stopped",
    ip: await clientIp(),
    metadata: { count: cancelled, reason: "stopped by staff" },
  });
  revalidatePath(`/intakes/${intakeId}`);
}

/** Assign a clinician. Separate from the send path so a plan gate never blocks it. */
export async function assignIntakeAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const intakeId = String(formData.get("intakeId") ?? "");
  const assignedUserId = String(formData.get("assignedUserId") ?? "") || null;
  await assignIntake(practice.id, intakeId, assignedUserId, actorFor(user, await clientIp()));
  revalidatePath(`/intakes/${intakeId}`);
}
