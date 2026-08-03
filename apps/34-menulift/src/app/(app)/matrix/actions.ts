"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { menuItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { parseMoneyToCents } from "@/lib/format";
import { updateItem } from "@/lib/menus";
import { assignUnmatchedRow, deleteImport, importById, recomputeImportsForItem, runImport } from "@/lib/import-run";
import { MAX_IMPORT_ROWS } from "@/lib/pos-import";
import { featureAllowed, planRequiredFor } from "@/lib/plans";
import type { ImportState, SimpleState } from "./state";

/** 8MB of CSV is roughly 100k rows — far past what we will read. */
const MAX_CSV_BYTES = 8 * 1024 * 1024;

export async function importCsvAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  let summary: string;
  try {
    const ctx = await requireUser();
    if (!featureAllowed(ctx.organization.plan, "posImport")) {
      return {
        error: `POS import is on the ${planRequiredFor("posImport").name} plan.`,
        ok: null,
        needsMapping: null,
      };
    }

    // Either a fresh file, or the retry after the mapping UI.
    let csv = String(formData.get("csv") ?? "");
    let filename = String(formData.get("filename") ?? "sales.csv");
    const file = formData.get("file");
    const uploaded = file instanceof File && file.name.length > 0;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_CSV_BYTES) {
        return {
          error: `That file is ${(file.size / 1_048_576).toFixed(1)}MB. Export a shorter period — the importer reads up to ${MAX_IMPORT_ROWS.toLocaleString()} rows.`,
          ok: null,
          needsMapping: null,
        };
      }
      csv = new TextDecoder("utf-8").decode(await file.arrayBuffer());
      filename = file.name;
    }
    if (!csv.trim()) {
      return {
        error: uploaded
          ? "That file is empty. Export it again from your POS — the download may have failed."
          : "Choose a CSV exported from your POS",
        ok: null,
        needsMapping: null,
      };
    }

    const nameCol = String(formData.get("mapName") ?? "").trim();
    const qtyCol = String(formData.get("mapQty") ?? "").trim();
    const netCol = String(formData.get("mapNet") ?? "").trim();
    const mapping = nameCol && qtyCol && netCol ? { name: nameCol, qty: qtyCol, net: netCol } : null;

    const result = await runImport({
      locationId: ctx.location.id,
      filename,
      csv,
      mapping,
    });

    if (!result.ok) {
      return {
        error: result.message,
        ok: null,
        needsMapping:
          result.kind === "needs_mapping"
            ? { headers: result.headers.filter(Boolean), sample: result.sample, csv }
            : null,
      };
    }

    revalidatePath("/matrix");
    const rate = (result.matchRateBp / 100).toFixed(0);
    summary = `${result.matchedCount} of ${result.rowCount} rows matched (${rate}%) · ${result.summary.star} stars, ${result.summary.dog} dogs${
      result.summary.needsCost ? `, ${result.summary.needsCost} waiting on plate costs` : ""
    }`;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not read that file",
      ok: null,
      needsMapping: null,
    };
  }

  /*
   * The summary cannot be returned as form state: a successful import turns the
   * empty-state page into the populated matrix, where this same form lives inside
   * a collapsed <details>. The message would render, correctly, somewhere nobody
   * can see. So it travels in the URL instead. `redirect` throws, so it is issued
   * outside the try block — catching it would report a success as a failure.
   */
  redirect(`/matrix?imported=${encodeURIComponent(summary)}`);
}

/** Fill in a plate cost from the matrix screen, then rebuild the analysis. */
export async function setPlateCostAction(
  _prev: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  try {
    const ctx = await requireUser();
    const itemId = String(formData.get("itemId") ?? "");
    const db = getDb();
    const [item] = await db
      .select({ id: menuItems.id, name: menuItems.name })
      .from(menuItems)
      .where(and(eq(menuItems.id, itemId), eq(menuItems.locationId, ctx.location.id)));
    if (!item) return { error: "That dish is not at this location", ok: null };

    const raw = String(formData.get("cost") ?? "").trim();
    const costCents = raw ? parseMoneyToCents(raw) : null;
    if (raw && costCents === null) return { error: "That plate cost isn't a number", ok: null };

    await updateItem(
      itemId,
      { costCents },
      { userId: ctx.user.id, label: ctx.user.name || ctx.user.email.split("@")[0] },
    );
    await recomputeImportsForItem(itemId);
    revalidatePath("/matrix");
    revalidatePath("/menu");
    return { error: null, ok: `${item.name} updated` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save that cost", ok: null };
  }
}

export async function assignRowAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  try {
    const ctx = await requireUser();
    const importId = String(formData.get("importId") ?? "");
    const record = await importById(importId, ctx.location.id);
    if (!record) return { error: "That import is not at this location", ok: null };
    await assignUnmatchedRow(importId, String(formData.get("rowName") ?? ""), String(formData.get("itemId") ?? ""));
    revalidatePath("/matrix");
    return { error: null, ok: "Matched" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not match that row", ok: null };
  }
}

export async function deleteImportAction(_prev: SimpleState, formData: FormData): Promise<SimpleState> {
  try {
    const ctx = await requireUser();
    const importId = String(formData.get("importId") ?? "");
    await deleteImport(importId, ctx.location.id);
    revalidatePath("/matrix");
    return { error: null, ok: "Import removed" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove that import", ok: null };
  }
}
