"use server";

/**
 * Packet-builder actions.
 *
 * The builder is configuration, not a canvas (README differentiation 3), so these
 * actions are small and structural: copy a template, reorder, remove, edit one
 * block's config, publish. Publishing is the only one with teeth — it validates
 * the whole packet and snapshots it.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorFor, requireUser } from "@/lib/auth";
import {
  archiveForm,
  createFormFromTemplate,
  FormError,
  getForm,
  publishForm,
  saveDraft,
} from "@/lib/forms";
import { CONFIG_SCHEMAS, parseConfig } from "@/lib/blocks";
import { clientIp } from "@/lib/request";
import { screenerDefinition } from "@/lib/screeners";
import type { BlockKind, FormBlock } from "@/db/schema";

export async function copyTemplateAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const templateKey = String(formData.get("templateKey") ?? "");
  const form = await createFormFromTemplate(
    practice.id,
    templateKey,
    actorFor(user, await clientIp()),
  );
  redirect(`/forms/${form.id}`);
}

export interface BuilderState {
  error: string | null;
}

export async function publishFormAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const { user, practice } = await requireUser();
  const formId = String(formData.get("formId") ?? "");
  try {
    await publishForm(practice.id, formId, actorFor(user, await clientIp()));
    revalidatePath(`/forms/${formId}`);
    return { error: null };
  } catch (err) {
    if (err instanceof FormError) return { error: err.message };
    console.error("[publish] failed", err);
    return { error: "Could not publish that packet. Try again." };
  }
}

/** Reorder or remove a block. One action, because both are a rewrite of the list. */
export async function reorderBlockAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const formId = String(formData.get("formId") ?? "");
  const blockKey = String(formData.get("blockKey") ?? "");
  const direction = String(formData.get("direction") ?? "");

  const form = await getForm(practice.id, formId);
  if (!form) return;
  const blocks = [...form.blocks];
  const index = blocks.findIndex((b) => b.key === blockKey);
  if (index === -1) return;

  if (direction === "remove") {
    blocks.splice(index, 1);
  } else {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= blocks.length) return;
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  }

  await saveDraft(practice.id, formId, { blocks }, actorFor(user, await clientIp()));
  revalidatePath(`/forms/${formId}`);
}

export async function renameFormAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const formId = String(formData.get("formId") ?? "");
  await saveDraft(
    practice.id,
    formId,
    { title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? "") },
    actorFor(user, await clientIp()),
  );
  revalidatePath(`/forms/${formId}`);
}

/**
 * Edit one block's config. Consent text and the disclosure sentence come through
 * here, which is why the whole config is re-parsed against its zod schema rather
 * than merged field by field: a half-valid consent block is worse than a rejected
 * edit.
 */
export async function editBlockAction(
  _prev: BuilderState,
  formData: FormData,
): Promise<BuilderState> {
  const { user, practice } = await requireUser();
  const formId = String(formData.get("formId") ?? "");
  const blockKey = String(formData.get("blockKey") ?? "");

  const form = await getForm(practice.id, formId);
  if (!form) return { error: "That packet is not in this practice" };
  const index = form.blocks.findIndex((b) => b.key === blockKey);
  if (index === -1) return { error: "That block is not in this packet" };
  const block = form.blocks[index];

  const next: Record<string, unknown> = { ...block.config };
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("config.") || typeof value !== "string") continue;
    const field = key.slice("config.".length);
    next[field] = value === "on" ? true : value === "off" ? false : value;
  }
  // Checkboxes that are unticked send nothing at all.
  if (block.kind === "consent") next.requireScroll = formData.get("config.requireScroll") === "on";
  if (block.kind === "signature") next.allowDrawn = formData.get("config.allowDrawn") === "on";
  if (block.kind === "upload") {
    next.required = formData.get("config.required") === "on";
    next.maxBytes = Number.parseInt(String(next.maxBytes ?? "8388608"), 10);
    next.accept = ["image/jpeg", "image/png", "application/pdf"];
  }

  try {
    parseConfig(block.kind, next);
  } catch (err) {
    const message =
      err && typeof err === "object" && "issues" in err
        ? String((err as { issues: { message: string }[] }).issues[0]?.message ?? "Invalid block")
        : "Invalid block";
    return { error: message };
  }

  const blocks = [...form.blocks];
  blocks[index] = { ...block, config: next };
  await saveDraft(practice.id, formId, { blocks }, actorFor(user, await clientIp()));
  revalidatePath(`/forms/${formId}`);
  return { error: null };
}

/** Add a block of a given kind, with a sensible starting config for that kind. */
export async function addBlockAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const formId = String(formData.get("formId") ?? "");
  const kind = String(formData.get("kind") ?? "") as BlockKind;
  if (!(kind in CONFIG_SCHEMAS)) return;

  const form = await getForm(practice.id, formId);
  if (!form) return;

  const key = uniqueKey(kind, form.blocks, String(formData.get("instrument") ?? ""));
  const block: FormBlock = { key, kind, config: starterConfig(kind, formData) };
  const blocks = [...form.blocks];

  // A signature block belongs immediately after the consent it signs; anything
  // else lands at the end, which is where a builder expects a new card.
  if (kind === "signature") {
    const consentKey = String(block.config.consentBlockKey ?? "");
    const at = blocks.findIndex((b) => b.key === consentKey);
    if (at === -1) return;
    blocks.splice(at + 1, 0, block);
  } else {
    blocks.push(block);
  }

  await saveDraft(practice.id, formId, { blocks }, actorFor(user, await clientIp()));
  revalidatePath(`/forms/${formId}`);
}

function uniqueKey(kind: BlockKind, blocks: FormBlock[], instrument: string): string {
  const base = kind === "screener" && instrument ? instrument : kind;
  if (!blocks.some((b) => b.key === base)) return base;
  for (let n = 2; n < 50; n += 1) {
    const candidate = `${base}_${n}`;
    if (!blocks.some((b) => b.key === candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

function starterConfig(kind: BlockKind, formData: FormData): Record<string, unknown> {
  switch (kind) {
    case "demographics":
      return {
        heading: "About you",
        fields: [
          { key: "first_name", required: true },
          { key: "last_name", required: true },
          { key: "dob", required: true },
          { key: "phone", required: true },
          { key: "email", required: true },
        ],
      };
    case "insurance":
      return {
        heading: "Insurance",
        fields: [
          { key: "self_pay", required: true },
          { key: "carrier", required: false },
          { key: "member_id", required: false },
        ],
      };
    case "history":
      return {
        heading: "History",
        intro: "",
        questions: [
          {
            key: "presenting_concern",
            label: "What would you like help with?",
            kind: "long_text",
            required: true,
          },
        ],
      };
    case "screener": {
      const instrument = String(formData.get("instrument") ?? "phq9");
      return { instrument: screenerDefinition(instrument) ? instrument : "phq9" };
    }
    case "consent":
      return {
        heading: "Consent",
        requireScroll: true,
        body:
          "Replace this with the consent your practice uses. It should say what the patient is " +
          "agreeing to, in plain language, and it should name your practice.",
      };
    case "signature":
      return {
        heading: "Signature",
        disclosure:
          "By typing or drawing my name below I am signing this document electronically. " +
          "I agree that my electronic signature is the legal equivalent of my handwritten signature.",
        allowDrawn: true,
        consentBlockKey: String(formData.get("consentBlockKey") ?? ""),
      };
    case "upload":
      return {
        heading: "Upload",
        label: "Photo or PDF",
        help: "",
        accept: ["image/jpeg", "image/png", "application/pdf"],
        maxBytes: 8 * 1024 * 1024,
        required: false,
      };
    default:
      return {};
  }
}

export async function archiveFormAction(formData: FormData): Promise<void> {
  const { user, practice } = await requireUser();
  const formId = String(formData.get("formId") ?? "");
  await archiveForm(practice.id, formId, actorFor(user, await clientIp()));
  redirect("/forms");
}
