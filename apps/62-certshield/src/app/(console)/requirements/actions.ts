"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { accessLevel } from "@/lib/plans";
import { createTemplate, templateById, updateTemplate, validateDraft } from "@/lib/requirements";
import { blastRadius, persistEvaluations, type BlastRadiusRow } from "@/lib/verdicts";
import type { RequirementFlags, RequirementLine } from "@/db/schema";

interface DraftPayload {
  name: string;
  notes: string | null;
  lines: RequirementLine[];
  flags: RequirementFlags;
}

/** Read the editor's JSON payload, refusing anything that is not the right shape. */
function readDraft(formData: FormData): DraftPayload {
  const raw = String(formData.get("draft") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The editor sent something CertShield could not read. Reload and try again.");
  }
  const draft = parsed as Partial<DraftPayload>;
  if (!draft || typeof draft.name !== "string" || !Array.isArray(draft.lines)) {
    throw new Error("The editor sent something CertShield could not read. Reload and try again.");
  }
  const lines: RequirementLine[] = draft.lines.map((line) => ({
    coverage: line.coverage,
    label: String(line.label ?? ""),
    minCents: Math.round(Number(line.minCents ?? 0)),
  }));
  const checked = validateDraft({
    name: draft.name,
    notes: draft.notes ?? null,
    lines,
    flags: draft.flags ?? {},
  });
  if (!checked.ok) throw new Error(checked.error);
  return checked.draft as DraftPayload;
}

export interface PreviewState {
  error: string | null;
  affected: BlastRadiusRow[] | null;
  checked: number;
}

/**
 * The blast-radius preview (DESIGN.md screen 5): which engagements would flip
 * verdicts if this edit saved. Runs the engine twice — once with the saved
 * template, once with the draft — and changes nothing.
 */
export async function previewTemplateAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const { org } = await requireUser();
  const templateId = String(formData.get("templateId") ?? "");
  try {
    const draft = readDraft(formData);
    if (!templateId || templateId === "new") {
      return { error: null, affected: [], checked: 0 };
    }
    const existing = await templateById(org.id, templateId);
    if (!existing) throw new Error("That template is not in your requirements.");
    const result = await blastRadius(org, templateId, {
      lines: draft.lines,
      flags: draft.flags,
    });
    return { error: null, affected: result.affected, checked: result.checked };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not work out the impact.",
      affected: null,
      checked: 0,
    };
  }
}

export interface SaveState {
  error: string | null;
}

export async function saveTemplateAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const { user, org } = await requireUser();
  const actor = `${user.name} <${user.email}>`;
  const templateId = String(formData.get("templateId") ?? "");
  let target = templateId;
  try {
    if (accessLevel(org) === "read_only") {
      throw new Error("Your trial has ended, so requirements are read-only. Choose a plan to edit.");
    }
    const draft = readDraft(formData);
    if (!templateId || templateId === "new") {
      const created = await createTemplate(org, actor, draft);
      target = created.id;
    } else {
      await updateTemplate(org, actor, templateId, draft);
    }
    // Verdicts are re-derived on every render, so this is not what makes the
    // dashboard correct — it is what puts the flip in the history, so an audit can
    // see when the requirement changed and what it changed.
    await persistEvaluations(org);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the template." };
  }
  revalidatePath("/requirements");
  revalidatePath("/dashboard");
  redirect(`/requirements/${target}?saved=1`);
}
