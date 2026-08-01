"use server";

/**
 * Answer-library mutations. A version bumps only when the text actually changed;
 * "mark reviewed" touches the review clock without inventing a version nobody
 * wrote.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { answers, type AnswerKind } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { shouldBumpVersion } from "@/lib/answers";

export interface LibraryActionState {
  error: string | null;
  ok?: boolean;
}

const KINDS: AnswerKind[] = [
  "mission_short",
  "mission_long",
  "program",
  "budget",
  "board_list",
  "attachment",
  "custom",
];

function str(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}

export async function saveAnswerAction(
  _prev: LibraryActionState,
  form: FormData,
): Promise<LibraryActionState> {
  const { org } = await requireUser();
  const db = getDb();
  const id = str(form, "answerId");
  const title = str(form, "title");
  const body = form.get("body")?.toString() ?? "";
  const kindRaw = str(form, "kind");
  const kind = (KINDS as string[]).includes(kindRaw) ? (kindRaw as AnswerKind) : "custom";

  if (!title) return { error: "Give the block a name" };

  if (!id) {
    await db.insert(answers).values({
      organizationId: org.id,
      kind,
      title,
      body,
      lastReviewedAt: new Date(),
    });
    revalidatePath("/library");
    return { error: null, ok: true };
  }

  const [existing] = await db
    .select()
    .from(answers)
    .where(and(eq(answers.id, id), eq(answers.organizationId, org.id)));
  if (!existing) return { error: "That block is gone" };

  const bump = shouldBumpVersion(existing.body, body);
  await db
    .update(answers)
    .set({
      title,
      kind,
      body,
      version: bump ? existing.version + 1 : existing.version,
      // Editing is a review: you just read it.
      lastReviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(answers.id, id));

  revalidatePath("/library");
  return { error: null, ok: true };
}

export async function markReviewedAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const id = str(form, "answerId");
  if (!id) return;
  const db = getDb();
  await db
    .update(answers)
    .set({ lastReviewedAt: new Date() })
    .where(and(eq(answers.id, id), eq(answers.organizationId, org.id)));
  revalidatePath("/library");
}

export async function deleteAnswerAction(form: FormData): Promise<void> {
  const { org } = await requireUser();
  const id = str(form, "answerId");
  if (!id) return;
  const db = getDb();
  await db
    .delete(answers)
    .where(and(eq(answers.id, id), eq(answers.organizationId, org.id)));
  revalidatePath("/library");
}
