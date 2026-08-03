"use server";

/**
 * Import wizard actions. Committing an import rewrites a whole roster, so it is
 * office-manager-and-above; uploading and previewing are not, because a dry run
 * changes nothing.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth";
import { visitValueCentsFor } from "@/lib/attribution";
import { IMPORT_FIELDS, PMS_SOURCES, type ImportField, type PmsSource } from "@/lib/pms";
import { commitImport, previewImport, rollbackImport, uploadImport } from "@/server/imports";
import { runForLocation } from "@/server/jobs";

export interface ImportFormState {
  error: string | null;
}

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function uploadAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const ctx = await requireUser();
  const file = formData.get("file");
  const rawSource = String(formData.get("source") ?? "");
  const source = PMS_SOURCES.includes(rawSource as PmsSource) ? (rawSource as PmsSource) : undefined;

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose the CSV you exported from your practice-management system." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "That file is larger than 12 MB. Export active patients only, or split it." };
  }

  let importId: string;
  try {
    const content = await file.text();
    const result = await uploadImport({
      locationId: ctx.location.id,
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
      filename: file.name || "patients.csv",
      content,
      source,
    });
    importId = result.importId;
    await previewImport({ importId, locationIds: ctx.locations.map((l) => l.id) });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That file could not be read." };
  }
  redirect(`/imports/${importId}`);
}

/** Re-run the dry run with an edited mapping. Writes nothing to the roster. */
export async function remapAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const ctx = await requireUser();
  const importId = String(formData.get("importId") ?? "");
  const mapping: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("col:")) continue;
    const header = key.slice(4);
    const field = String(value);
    if (field && IMPORT_FIELDS.includes(field as ImportField)) mapping[header] = field;
  }

  try {
    await previewImport({ importId, locationIds: ctx.locations.map((l) => l.id), mapping });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not re-read that file." };
  }
  revalidatePath(`/imports/${importId}`);
  return { error: null };
}

export async function commitAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const importId = String(formData.get("importId") ?? "");
  // Inside the try: a server action is a public endpoint, so a role denial has to
  // return a sentence rather than an unhandled server error.
  try {
    const ctx = await requireRole("office_manager");
    await commitImport({
      importId,
      locationIds: ctx.locations.map((l) => l.id),
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
    });
    // The office manager who just imported 2,890 patients should not wait for a
    // cron to see their list, so the location's jobs run now.
    await runForLocation({
      locationId: ctx.location.id,
      practiceId: ctx.practice.id,
      timezone: ctx.location.timezone,
      visitValueCents: visitValueCentsFor(ctx.practice.settings),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not commit that import." };
  }
  redirect("/overdue");
}

export async function rollbackAction(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const importId = String(formData.get("importId") ?? "");
  try {
    const ctx = await requireRole("office_manager");
    await rollbackImport({
      importId,
      locationIds: ctx.locations.map((l) => l.id),
      practiceId: ctx.practice.id,
      actorId: ctx.user.id,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not roll that import back." };
  }
  revalidatePath("/imports");
  redirect("/imports");
}
