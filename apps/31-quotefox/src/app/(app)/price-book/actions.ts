"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOnboardedUser } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import {
  applyImport,
  archiveItem,
  createItem,
  planImport,
  seedStarterTemplate,
  updateItem,
  type ImportOutcome,
} from "@/lib/price-book";
import type { PriceBookItemKind, Unit } from "@/db/schema";

export interface ItemFormState {
  error?: string;
}

function readItem(formData: FormData) {
  return {
    category: String(formData.get("category") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "material") as PriceBookItemKind,
    unit: String(formData.get("unit") ?? "each") as Unit,
    unitCostRaw: String(formData.get("unitCost") ?? ""),
    markupRaw: String(formData.get("markupPct") ?? "").trim(),
  };
}

export async function createItemAction(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const { org, user } = await requireOnboardedUser();
  const values = readItem(formData);
  const cents = parseAmountToCents(values.unitCostRaw);
  if (cents === null) return { error: "Enter a cost, like 68 or 1,950.00." };
  const markupPct = values.markupRaw === "" ? null : Number(values.markupRaw);
  if (markupPct !== null && (!Number.isFinite(markupPct) || markupPct < 0 || markupPct > 400)) {
    return { error: "Markup should be a percentage between 0 and 400, or blank for your default." };
  }

  const result = await createItem(org, user.id, {
    category: values.category,
    name: values.name,
    description: values.description,
    kind: values.kind,
    unit: values.unit,
    unitCostCents: cents,
    markupPct,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/price-book");
  redirect("/price-book");
}

export async function updateItemAction(
  itemId: string,
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const { org, user } = await requireOnboardedUser();
  const values = readItem(formData);
  const cents = parseAmountToCents(values.unitCostRaw);
  if (cents === null) return { error: "Enter a cost, like 68 or 1,950.00." };
  const markupPct = values.markupRaw === "" ? null : Number(values.markupRaw);

  const result = await updateItem(org, user.id, itemId, {
    category: values.category,
    name: values.name,
    description: values.description,
    kind: values.kind,
    unit: values.unit,
    unitCostCents: cents,
    markupPct,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/price-book");
  redirect("/price-book");
}

export async function archiveItemAction(itemId: string): Promise<void> {
  const { org, user } = await requireOnboardedUser();
  await archiveItem(org, user.id, itemId);
  revalidatePath("/price-book");
  redirect("/price-book");
}

export async function seedStarterAction(): Promise<void> {
  const { org } = await requireOnboardedUser();
  await seedStarterTemplate(org.id, org.trade);
  revalidatePath("/price-book");
}

export interface ImportState {
  error?: string;
  outcome?: ImportOutcome;
  skipped?: Array<{ line: number; reason: string }>;
}

/**
 * Import a rate sheet. The plan is computed first and reported in full — how many
 * rows will land, how many are updates, and every row that could not be read, with
 * its line number. A quiet partial import is how a contractor ends up quoting from
 * a book they think is complete.
 */
export async function importCsvAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const { org, user } = await requireOnboardedUser();
  const file = formData.get("file");
  const pasted = String(formData.get("pasted") ?? "");
  let text = pasted;
  if (file instanceof File && file.size > 0) {
    if (file.size > 4_000_000) return { error: "That file is over 4MB — split it and try again." };
    text = await file.text();
  }
  if (!text.trim()) return { error: "Choose a CSV file, or paste the rows in." };

  const plan = planImport(text);
  if (!plan.rows.length) {
    return {
      error: plan.skipped[0]?.reason ?? "Nothing in that file could be read as a price book.",
      skipped: plan.skipped.map((row) => ({ line: row.line, reason: row.reason })),
    };
  }
  const outcome = await applyImport(org, user.id, plan);
  revalidatePath("/price-book");
  return {
    outcome,
    skipped: outcome.skipped.map((row) => ({ line: row.line, reason: row.reason })),
  };
}
