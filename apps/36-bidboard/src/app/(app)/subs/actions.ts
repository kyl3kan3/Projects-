"use server";

import { revalidatePath } from "next/cache";
import { requireEstimator } from "@/lib/auth";
import type { ActionState } from "@/components/ActionForm";
import { addSubContact, createSubCompany, importSubs, parseSubImport, updateSubNotes } from "@/lib/subs";

export async function importSubsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    const pasted = String(form.get("pasted") ?? "");
    const file = form.get("file");
    const text =
      file instanceof File && file.size > 0 ? await file.text() : pasted;
    if (!text.trim()) return { error: "Paste some rows or choose a CSV file" };

    const preview = parseSubImport(text);
    if (preview.rows.length === 0) {
      return {
        error: `Nothing usable in that. ${preview.skipped.length} row${preview.skipped.length === 1 ? "" : "s"} skipped — every row needs a company name and an email.`,
      };
    }

    const result = await importSubs(
      ctx.company.id,
      { userId: ctx.user.id, label: ctx.user.email },
      preview.rows,
    );
    revalidatePath("/subs");

    const parts = [
      `${result.companiesCreated} new sub${result.companiesCreated === 1 ? "" : "s"}`,
      `${result.contactsCreated} contact${result.contactsCreated === 1 ? "" : "s"}`,
    ];
    if (result.companiesUpdated > 0) parts.push(`${result.companiesUpdated} updated`);
    if (result.contactsSkipped > 0) parts.push(`${result.contactsSkipped} already on file`);
    return {
      ok: `Imported: ${parts.join(", ")}.`,
      detail:
        preview.skipped.length > 0
          ? `Skipped ${preview.skipped.length}: ${preview.skipped
              .slice(0, 4)
              .map((s) => `line ${s.line} (${s.reason})`)
              .join(", ")}`
          : undefined,
    };
  } catch (err) {
    console.error("import failed", err);
    return { error: "Could not import those rows" };
  }
}

export async function addSubAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    await createSubCompany(ctx.company.id, {
      name: String(form.get("name") ?? ""),
      trades: form.getAll("trades").map(String).filter(Boolean),
      city: String(form.get("city") ?? "") || null,
      notes: String(form.get("notes") ?? "") || null,
      contactName: String(form.get("contactName") ?? ""),
      contactEmail: String(form.get("contactEmail") ?? ""),
      contactPhone: String(form.get("contactPhone") ?? "") || null,
    });
    revalidatePath("/subs");
    return { ok: "Added to your directory" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that sub" };
  }
}

export async function addContactAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    await addSubContact(ctx.company.id, String(form.get("subCompanyId") ?? ""), {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? "") || null,
    });
    revalidatePath("/subs");
    return { ok: "Contact added" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add that contact" };
  }
}

export async function updateSubAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const ctx = await requireEstimator();
    await updateSubNotes(ctx.company.id, String(form.get("subCompanyId") ?? ""), {
      notes: String(form.get("notes") ?? "") || null,
      performanceNote: String(form.get("performanceNote") ?? "") || null,
      trades: form.getAll("trades").map(String).filter(Boolean),
    });
    revalidatePath("/subs");
    return { ok: "Saved" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that" };
  }
}
