"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { FormState } from "@/components/ActionForm";
import { requireCan } from "@/lib/auth";
import { matPromotion, reversePromotion } from "@/lib/gradings";
import { recordCheckin } from "@/lib/kiosk";
import {
  createFamily,
  createStudent,
  enrollStudent,
  setStudentStatus,
  signOff,
  updateStudentNotes,
} from "@/lib/roster";
import { disposition } from "@/lib/retention";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

/** The desk fallback: check anyone in from the roster in two taps. */
export async function deskCheckinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireCan("check_in");
  const studentId = String(formData.get("studentId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const classScheduleId = String(formData.get("classScheduleId") ?? "") || null;
  try {
    const result = await recordCheckin({
      schoolId: school.id,
      studentId,
      enrollmentId,
      // The desk's key is server-generated: this is a deliberate tap, not an
      // offline replay, so there is nothing to deduplicate against.
      clientKey: `desk:${randomUUID()}`,
      source: "desk",
      classScheduleId,
    });
    revalidatePath("/roster");
    revalidatePath(`/roster/${studentId}`);
    return {
      ok: `${result.studentName} checked in${result.classLabel ? ` — ${result.classLabel}` : " — open mat"}. ${result.progress.classesDone} / ${result.progress.classesRequired} classes toward ${result.progress.step === "stripe" ? "the next stripe" : "the next rank"}.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function addStudentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_roster");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const familyId = String(formData.get("familyId") ?? "");
  const newFamilyName = String(formData.get("newFamilyName") ?? "").trim();
  const guardianEmail = String(formData.get("guardianEmail") ?? "").trim();
  const guardianPhone = String(formData.get("guardianPhone") ?? "").trim();
  const programId = String(formData.get("programId") ?? "");
  const rankId = String(formData.get("rankId") ?? "");
  const stripes = Number(formData.get("stripes") ?? 0);
  const promotedOn = String(formData.get("promotedOn") ?? "").trim();

  try {
    let resolvedFamilyId = familyId;
    if (!resolvedFamilyId) {
      if (!newFamilyName) throw new Error("Pick a household, or name a new one");
      const family = await createFamily({
        schoolId: school.id,
        name: newFamilyName,
        email: guardianEmail || null,
        phone: guardianPhone || null,
      });
      resolvedFamilyId = family.id;
    }
    const student = await createStudent({
      schoolId: school.id,
      familyId: resolvedFamilyId,
      firstName,
      lastName,
      actorId: user.id,
    });
    if (programId && rankId) {
      await enrollStudent({
        studentId: student.id,
        programId,
        rankId,
        currentStripes: Number.isFinite(stripes) ? Math.max(0, stripes) : 0,
        promotedAt: promotedOn ? new Date(`${promotedOn}T12:00:00Z`) : new Date(),
      });
    }
    revalidatePath("/roster");
    return { ok: `${firstName} ${lastName} added — PIN ${student.kioskPin}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function matPromotionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("record_promotion");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const note = String(formData.get("note") ?? "");

  // `redirect()` throws a control-flow signal that a catch block would swallow,
  // turning a successful promotion into a bogus error message on screen. So the
  // work happens inside the try and the navigation happens strictly after it.
  let seated: { rank: string; stripes: number };
  try {
    const promotion = await matPromotion({
      enrollmentId,
      schoolId: school.id,
      gradedBy: user.id,
      note,
    });
    seated = { rank: promotion.toRankName, stripes: promotion.toStripes };
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/roster/${studentId}`);
  revalidatePath("/roster");
  redirect(
    `/roster/${studentId}?seated=${encodeURIComponent(seated.rank)}&stripes=${seated.stripes}`,
  );
}

export async function reversePromotionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { school, user } = await requireCan("record_promotion");
  const promotionId = String(formData.get("promotionId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  try {
    await reversePromotion({ promotionId, schoolId: school.id, actorId: user.id, reason });
    revalidatePath(`/roster/${studentId}`);
    return { ok: "Reversal appended. The original promotion stays on the record." };
  } catch (err) {
    return fail(err);
  }
}

export async function setStatusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_roster");
  const studentId = String(formData.get("studentId") ?? "");
  const status = String(formData.get("status") ?? "active") as "active" | "paused" | "inactive";
  try {
    await setStudentStatus({ schoolId: school.id, studentId, status, actorId: user.id });
    revalidatePath(`/roster/${studentId}`);
    revalidatePath("/roster");
    return {
      ok:
        status === "paused"
          ? "Paused. The time-in-rank clock stops and the retention scan will leave them alone."
          : status === "inactive"
            ? "Marked inactive. Their record and promotion history stay intact."
            : "Back to active — the clock restarts from today.",
    };
  } catch (err) {
    return fail(err);
  }
}

export async function signOffAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("record_promotion");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const clear = String(formData.get("clear") ?? "") === "1";
  try {
    await signOff({ schoolId: school.id, enrollmentId, actorId: user.id, clear });
    revalidatePath(`/roster/${studentId}`);
    return { ok: clear ? "Sign-off withdrawn." : `Signed off by ${user.name}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function saveNotesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireCan("edit_roster");
  const studentId = String(formData.get("studentId") ?? "");
  try {
    await updateStudentNotes({
      schoolId: school.id,
      studentId,
      notes: String(formData.get("notes") ?? ""),
    });
    revalidatePath(`/roster/${studentId}`);
    return { ok: "Notes saved." };
  } catch (err) {
    return fail(err);
  }
}

export async function flagOutcomeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("disposition_flag");
  const flagId = String(formData.get("flagId") ?? "");
  const status = String(formData.get("status") ?? "contacted") as
    | "contacted"
    | "recovered"
    | "lost";
  try {
    await disposition({
      flagId,
      schoolId: school.id,
      actorId: user.id,
      status,
      note: String(formData.get("note") ?? ""),
    });
    revalidatePath("/retention");
    revalidatePath("/roster");
    return { ok: `Recorded as ${status}.` };
  } catch (err) {
    return fail(err);
  }
}
