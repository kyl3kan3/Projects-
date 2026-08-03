"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { enrollments, programs, ranks } from "@/db/schema";
import type { FormState } from "@/components/ActionForm";
import { audit } from "@/lib/audit";
import { requireCan } from "@/lib/auth";
import { parseHex } from "@/lib/belt";

function fail(err: unknown): FormState {
  return { error: err instanceof Error ? err.message : "That did not work" };
}

async function assertProgram(schoolId: string, programId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.schoolId, schoolId)));
  if (!row) throw new Error("Program not found");
}

export async function createProgramAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Give the program a name" };
  const db = getDb();
  try {
    const [program] = await db
      .insert(programs)
      .values({
        schoolId: school.id,
        name,
        description: String(formData.get("description") ?? "").trim(),
        status: "active",
      })
      .returning();
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "curriculum.program_created",
      target: program.id,
      metadata: { name },
    });
    revalidatePath("/curriculum");
    return { ok: `${name} created. Add its ranks from the bottom of the ladder up.` };
  } catch (err) {
    return fail(err);
  }
}

export async function addRankAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const programId = String(formData.get("programId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const beltColorHex = String(formData.get("beltColorHex") ?? "#F2EFE6").trim();
  const stripes = Number(formData.get("stripes") ?? 0);
  const minClasses = Number(formData.get("minClasses") ?? 0);
  const minDaysInRank = Number(formData.get("minDaysInRank") ?? 0);
  const requiresSignoff = String(formData.get("requiresSignoff") ?? "") === "on";

  try {
    await assertProgram(school.id, programId);
    if (name.length < 2) throw new Error("Give the rank a name");
    if (!parseHex(beltColorHex)) throw new Error("The belt colour needs to be a hex value like #2B4C7E");
    if (!Number.isInteger(stripes) || stripes < 0 || stripes > 10) {
      throw new Error("Stripes must be a whole number from 0 to 10");
    }
    if (!Number.isInteger(minClasses) || minClasses < 0) throw new Error("Minimum classes must be a whole number");
    if (!Number.isInteger(minDaysInRank) || minDaysInRank < 0) throw new Error("Minimum days must be a whole number");

    const db = getDb();
    const [top] = await db
      .select({ order: max(ranks.displayOrder) })
      .from(ranks)
      .where(eq(ranks.programId, programId));
    const displayOrder = (top?.order ?? -1) + 1;

    const [rank] = await db
      .insert(ranks)
      .values({
        programId,
        name,
        displayOrder,
        beltColorHex,
        stripes,
        minClasses,
        minDaysInRank,
        requiresSignoff,
      })
      .returning();
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "curriculum.rank_added",
      target: rank.id,
      metadata: { name, programId, minClasses, minDaysInRank },
    });
    revalidatePath("/curriculum");
    return { ok: `${name} added at position ${displayOrder + 1}.` };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRankAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const rankId = String(formData.get("rankId") ?? "");
  const stripes = Number(formData.get("stripes") ?? 0);
  const minClasses = Number(formData.get("minClasses") ?? 0);
  const minDaysInRank = Number(formData.get("minDaysInRank") ?? 0);
  const requiresSignoff = String(formData.get("requiresSignoff") ?? "") === "on";
  const beltColorHex = String(formData.get("beltColorHex") ?? "").trim();

  try {
    const db = getDb();
    const [row] = await db
      .select({ rank: ranks, programId: programs.id })
      .from(ranks)
      .innerJoin(programs, eq(programs.id, ranks.programId))
      .where(and(eq(ranks.id, rankId), eq(programs.schoolId, school.id)));
    if (!row) throw new Error("Rank not found");
    if (!Number.isInteger(stripes) || stripes < 0 || stripes > 10) {
      throw new Error("Stripes must be a whole number from 0 to 10");
    }
    if (beltColorHex && !parseHex(beltColorHex)) {
      throw new Error("The belt colour needs to be a hex value like #2B4C7E");
    }

    // Reducing the stripe count below what somebody has already earned would
    // silently un-award a stripe. Refuse rather than quietly rewrite history.
    if (stripes < row.rank.stripes) {
      const holders = await db
        .select({ id: enrollments.id, currentStripes: enrollments.currentStripes })
        .from(enrollments)
        .where(and(eq(enrollments.currentRankId, rankId)));
      const highest = holders.reduce((m, h) => Math.max(m, h.currentStripes), 0);
      if (highest > stripes) {
        throw new Error(
          `Somebody at this rank already has ${highest} stripes — lowering the count to ${stripes} would erase an earned stripe.`,
        );
      }
    }

    await db
      .update(ranks)
      .set({
        stripes,
        minClasses: Math.max(0, minClasses),
        minDaysInRank: Math.max(0, minDaysInRank),
        requiresSignoff,
        beltColorHex: beltColorHex || row.rank.beltColorHex,
      })
      .where(eq(ranks.id, rankId));
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "curriculum.rank_updated",
      target: rankId,
      metadata: { stripes, minClasses, minDaysInRank, requiresSignoff },
    });
    revalidatePath("/curriculum");
    revalidatePath("/roster");
    return { ok: `${row.rank.name} updated. Every progress bar in the school just recomputed.` };
  } catch (err) {
    return fail(err);
  }
}

export async function archiveProgramAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { school, user } = await requireCan("edit_curriculum");
  const programId = String(formData.get("programId") ?? "");
  try {
    await assertProgram(school.id, programId);
    const db = getDb();
    const active = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.programId, programId), eq(enrollments.status, "active")));
    if (active.length > 0) {
      throw new Error(
        `${active.length} student${active.length === 1 ? " is" : "s are"} still enrolled. Move or pause them first — archiving would strand their rank history.`,
      );
    }
    await db.update(programs).set({ status: "archived", updatedAt: new Date() }).where(eq(programs.id, programId));
    await audit({
      schoolId: school.id,
      actorId: user.id,
      action: "curriculum.program_archived",
      target: programId,
    });
    revalidatePath("/curriculum");
    return { ok: "Archived. Its promotion history stays on every student's record." };
  } catch (err) {
    return fail(err);
  }
}

export async function enrollAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { school } = await requireCan("edit_roster");
  const studentId = String(formData.get("studentId") ?? "");
  const programId = String(formData.get("programId") ?? "");
  const rankId = String(formData.get("rankId") ?? "");
  try {
    await assertProgram(school.id, programId);
    const db = getDb();
    const ladder = await db
      .select({ id: ranks.id })
      .from(ranks)
      .where(eq(ranks.programId, programId))
      .orderBy(asc(ranks.displayOrder));
    if (!ladder.some((r) => r.id === rankId)) throw new Error("That rank is not in this program");
    const { enrollStudent } = await import("@/lib/roster");
    await enrollStudent({ studentId, programId, rankId });
    revalidatePath(`/roster/${studentId}`);
    return { ok: "Enrolled." };
  } catch (err) {
    return fail(err);
  }
}
