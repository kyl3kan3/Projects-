"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { classSchedule, programs, ranks } from "@/db/schema";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { requireCan } from "@/lib/auth";
import { templateByKey } from "@/lib/curricula";
import { mintDeviceToken } from "@/lib/kiosk";
import { importStudents } from "@/lib/roster";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

/** Load a curriculum template: one program, its whole rank ladder. */
export async function loadTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const key = String(formData.get("template") ?? "");
  const template = templateByKey(key);
  if (!template) return { error: "Pick a curriculum template" };

  const db = getDb();
  try {
    const existing = await db
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.schoolId, school.id));
    if (existing.length >= 8) {
      return { error: "That is a lot of programs. Archive one before adding another." };
    }

    const [program] = await db
      .insert(programs)
      .values({
        schoolId: school.id,
        name: template.program,
        description: template.description,
        status: "active",
      })
      .returning();

    await db.insert(ranks).values(
      template.ranks.map((rank, index) => ({
        programId: program.id,
        name: rank.name,
        displayOrder: index,
        beltColorHex: rank.beltColorHex,
        stripes: rank.stripes,
        minClasses: rank.minClasses,
        minDaysInRank: rank.minDaysInRank,
        requiresSignoff: rank.requiresSignoff,
      })),
    );

    // A program with no class on the schedule cannot attach check-ins, so seed
    // two evening classes the school can rename or delete in one tap.
    await db.insert(classSchedule).values([
      {
        programId: program.id,
        weekday: 2,
        startsAtMinutes: 18 * 60,
        durationMinutes: 60,
        name: `${template.program} — Tuesday`,
        status: "active",
      },
      {
        programId: program.id,
        weekday: 4,
        startsAtMinutes: 18 * 60,
        durationMinutes: 60,
        name: `${template.program} — Thursday`,
        status: "active",
      },
    ]);

    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "curriculum.template_loaded",
      target: program.id,
      metadata: { template: key, ranks: template.ranks.length },
    });

    revalidatePath("/setup");
    revalidatePath("/curriculum");
    revalidatePath("/roster");
    return {
      ok: `${template.program} loaded — ${template.ranks.length} ranks, two weekly classes. Adjust anything in the curriculum.`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function importRosterAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_roster");
  const csv = String(formData.get("csv") ?? "");
  const programId = String(formData.get("programId") ?? "");
  if (csv.trim().length < 10) {
    return { error: "Paste the spreadsheet, header row and all." };
  }
  if (!programId) return { error: "Pick which program these students train in" };

  try {
    const summary = await importStudents({
      schoolId: school.id,
      csv,
      defaultProgramId: programId,
      actorId: user.id,
    });
    revalidatePath("/roster");
    revalidatePath("/setup");

    const parts = [
      `${summary.studentsCreated} student${summary.studentsCreated === 1 ? "" : "s"} imported into ${summary.familiesCreated} household${summary.familiesCreated === 1 ? "" : "s"}.`,
    ];
    if (summary.unmatchedRanks.length > 0) {
      parts.push(
        `Ranks not in the ladder, placed at the bottom: ${summary.unmatchedRanks.join(", ")}.`,
      );
    }
    if (summary.skipped.length > 0) {
      parts.push(
        `Skipped ${summary.skipped.length}: ${summary.skipped
          .slice(0, 3)
          .map((s) => `line ${s.line} — ${s.message}`)
          .join("; ")}${summary.skipped.length > 3 ? "…" : ""}`,
      );
    }
    if (summary.studentsCreated === 0) {
      return { error: parts.join(" ") };
    }
    return { ok: parts.join(" ") };
  } catch (err) {
    return fail(err);
  }
}

export async function createKioskAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("manage_kiosk");
  const name = String(formData.get("name") ?? "").trim();
  try {
    const { token } = await mintDeviceToken({
      schoolId: school.id,
      name: name || "Front door tablet",
      actorId: user.id,
    });
    revalidatePath("/setup");
    revalidatePath("/settings/kiosk");
    return {
      ok: `Open this on the tablet, once: /kiosk/${token}`,
    };
  } catch (err) {
    return fail(err);
  }
}

/** The onboarding goal: a sample grading event assembled from the real roster. */
export async function firstGradingAction(_prev: FormState): Promise<FormState> {
  const { school, user } = await requireCan("complete_grading");
  const db = getDb();
  try {
    const programList = await db
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.schoolId, school.id))
      .orderBy(asc(programs.name));
    if (programList.length === 0) return { error: "Load a curriculum template first" };

    const { assembleCandidates, createEvent } = await import("@/lib/gradings");
    const heldOn = new Date(Date.now() + 21 * 86_400_000);
    const event = await createEvent({
      schoolId: school.id,
      name: "First grading",
      heldOn,
      programIds: programList.map((p) => p.id),
      actorId: user.id,
    });
    const counts = await assembleCandidates(event.id);
    revalidatePath("/gradings");
    return {
      ok: `“First grading” created — ${counts.eligible} eligible, ${counts.nearMiss} near miss. Open it from Gradings.`,
    };
  } catch (err) {
    return fail(err);
  }
}
