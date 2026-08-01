"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createWaiver, publish, updateDraft, ValidationError } from "@/lib/waivers";
import { TEMPLATES, template } from "@/lib/templates";
import { DEFAULT_MINOR_RULE, type ExpiryRule, type WaiverBlock } from "@/db/schema";

export interface WaiverFormState {
  error?: string;
  ok?: string;
}

export async function createFromTemplateAction(
  _prev: WaiverFormState,
  form: FormData,
): Promise<WaiverFormState> {
  const { account } = await requireUser();
  const key = String(form.get("template") ?? "");
  const t = template(key) ?? TEMPLATES[0];
  const title = String(form.get("title") ?? "").trim() || `${t.name} waiver`;

  let waiverId: string;
  try {
    const waiver = await createWaiver({
      accountId: account.id,
      title,
      expiryRule: t.expiryRule,
      minorRule: { ...DEFAULT_MINOR_RULE, ageOfMajority: t.ageOfMajority },
      activityTags: t.activityTags,
      draftBlocks: t.blocks,
    });
    waiverId = waiver.id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the waiver" };
  }
  redirect(`/waivers/${waiverId}`);
}

/**
 * Save the draft, and publish a new version when that is what was asked for.
 *
 * Both live in one action because publishing must always snapshot what is on the
 * screen — a "publish" that shipped the previously saved draft instead of the
 * edits in front of the operator would be a legal-document bug of the worst kind.
 *
 * Published versions are never mutated: this writes the draft, then appends
 * version N+1. A signature taken last March cannot be changed by an edit today.
 */
export async function saveWaiverAction(
  _prev: WaiverFormState,
  form: FormData,
): Promise<WaiverFormState> {
  const { account } = await requireUser();
  const waiverId = String(form.get("waiverId") ?? "");
  const intent = String(form.get("intent") ?? "save");
  const blocksRaw = String(form.get("blocks") ?? "[]");

  let blocks: WaiverBlock[];
  try {
    blocks = JSON.parse(blocksRaw) as WaiverBlock[];
  } catch {
    return { error: "The block editor sent something we could not read. Reload and try again." };
  }

  try {
    await updateDraft(waiverId, account.id, {
      title: String(form.get("title") ?? ""),
      expiryRule: String(form.get("expiryRule") ?? "days_365") as ExpiryRule,
      minorRule: {
        ageOfMajority: Number(form.get("ageOfMajority") ?? 18),
        guardianSignsForSelf: form.get("guardianSignsForSelf") === "on",
        resignAtMajority: form.get("resignAtMajority") === "on",
      },
      draftBlocks: blocks,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the draft" };
  }

  if (intent !== "publish") {
    revalidatePath(`/waivers/${waiverId}`);
    return { ok: "Draft saved. Nothing changes for anyone who has already signed." };
  }

  try {
    const version = await publish(waiverId, account.id);
    revalidatePath(`/waivers/${waiverId}`);
    revalidatePath("/waivers");
    return {
      ok: `Published version ${version.version}. New signatures pin this text; older ones keep theirs, word for word.`,
    };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    return { error: err instanceof Error ? err.message : "Could not publish" };
  }
}
