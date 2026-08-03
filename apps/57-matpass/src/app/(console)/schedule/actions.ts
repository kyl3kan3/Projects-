"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { classSchedule, programs, users } from "@/db/schema";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { requireCan } from "@/lib/auth";
import { parseTimeToMinutes } from "@/lib/parse";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

export async function addClassAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const programId = String(formData.get("programId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const weekday = Number(formData.get("weekday") ?? 1);
  const durationMinutes = Number(formData.get("durationMinutes") ?? 60);
  const instructorId = String(formData.get("instructorId") ?? "") || null;

  try {
    const db = getDb();
    const [program] = await db
      .select({ id: programs.id })
      .from(programs)
      .where(and(eq(programs.id, programId), eq(programs.schoolId, school.id)));
    if (!program) throw new Error("Program not found");
    if (name.length < 2) throw new Error("Give the class a name, e.g. “Adults Gi 6pm”");
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("Pick a weekday");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 300) {
      throw new Error("Length should be between 15 and 300 minutes");
    }
    const startsAtMinutes = parseTimeToMinutes(String(formData.get("startsAt") ?? ""));

    if (instructorId) {
      const [instructor] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, instructorId), eq(users.schoolId, school.id)));
      if (!instructor) throw new Error("That instructor is not on your staff list");
    }

    const [slot] = await db
      .insert(classSchedule)
      .values({
        programId,
        name,
        weekday,
        startsAtMinutes,
        durationMinutes,
        instructorId,
        status: "active",
      })
      .returning();

    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "schedule.class_added",
      target: slot.id,
      metadata: { name, weekday, startsAtMinutes },
    });
    revalidatePath("/schedule");
    return { ok: `${name} added to the weekly schedule.` };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveClassAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const classId = String(formData.get("classId") ?? "");
  try {
    const db = getDb();
    const [row] = await db
      .select({ id: classSchedule.id, name: classSchedule.name })
      .from(classSchedule)
      .innerJoin(programs, eq(programs.id, classSchedule.programId))
      .where(and(eq(classSchedule.id, classId), eq(programs.schoolId, school.id)));
    if (!row) throw new Error("Class not found");
    // Archived, never deleted: check-ins already point at this row, and an
    // attendance record that cannot say which class it was is worthless.
    await db.update(classSchedule).set({ status: "archived" }).where(eq(classSchedule.id, classId));
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "schedule.class_archived",
      target: classId,
      metadata: { name: row.name },
    });
    revalidatePath("/schedule");
    return { ok: `${row.name} removed from the weekly schedule. Past check-ins keep their class.` };
  } catch (err) {
    return fail(err);
  }
}
