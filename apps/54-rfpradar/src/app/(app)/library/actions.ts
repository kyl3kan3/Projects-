"use server";

/**
 * Answer-library actions.
 *
 * Archiving is hold-to-confirm in the UI and audit-logged here, because a block
 * that quietly disappears from a shared library is the kind of thing that gets
 * noticed at 11pm the night before a submission.
 */

import { revalidatePath } from "next/cache";
import { requireWrite } from "@/lib/auth";
import { hasResponseWorkspace } from "@/lib/plans";
import { archiveBlock, createBlock, reviewBlock, updateBlock } from "@/lib/library";
import type { AnswerBlock } from "@/db/schema";

const KINDS: AnswerBlock["kind"][] = [
  "boilerplate",
  "past_answer",
  "bio",
  "past_performance",
  "attachment_ref",
];

export interface BlockFormState {
  error: string | null;
  notice: string | null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

async function gate() {
  const ctx = await requireWrite();
  if (!hasResponseWorkspace(ctx.access.planId)) {
    throw new Error(
      "The answer library is included on Pursuit and above. Discovery plans keep every feed; the response workspace is the upgrade.",
    );
  }
  return ctx;
}

export async function saveBlockAction(
  _prev: BlockFormState,
  formData: FormData,
): Promise<BlockFormState> {
  let ctx;
  try {
    ctx = await gate();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not available on this plan.", notice: null };
  }

  const kind = field(formData, "kind") as AnswerBlock["kind"];
  if (!KINDS.includes(kind)) return { error: "Pick a block kind.", notice: null };
  const title = field(formData, "title");
  const body = String(formData.get("body") ?? "");
  if (!title) return { error: "Give the block a title you would search for.", notice: null };
  if (!body.trim()) return { error: "A block with no text cannot be reused.", notice: null };

  const tags = field(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  const id = field(formData, "id");
  try {
    if (id) {
      const updated = await updateBlock({
        firmId: ctx.firm.id,
        actorUserId: ctx.user.id,
        blockId: id,
        block: { kind, title, body, tags },
      });
      revalidatePath("/library");
      return {
        error: null,
        notice: `Saved as v${updated.version}. Pursuits that already linked this block keep the version they froze.`,
      };
    }
    await createBlock({
      firmId: ctx.firm.id,
      actorUserId: ctx.user.id,
      block: { kind, title, body, tags },
    });
    revalidatePath("/library");
    revalidatePath("/radar");
    return { error: null, notice: "Block added and marked reviewed today." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save the block.", notice: null };
  }
}

export async function reviewBlockAction(formData: FormData): Promise<void> {
  const ctx = await gate();
  const blockId = String(formData.get("id") ?? "");
  await reviewBlock({ firmId: ctx.firm.id, actorUserId: ctx.user.id, blockId });
  revalidatePath("/library");
}

export async function archiveBlockAction(formData: FormData): Promise<void> {
  const ctx = await gate();
  const blockId = String(formData.get("id") ?? "");
  const archived = String(formData.get("archived") ?? "1") === "1";
  await archiveBlock({ firmId: ctx.firm.id, actorUserId: ctx.user.id, blockId, archived });
  revalidatePath("/library");
}
