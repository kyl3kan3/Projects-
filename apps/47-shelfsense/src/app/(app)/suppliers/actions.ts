"use server";

/**
 * Supplier actions: save a supplier, assign one to a SKU, and the CSV import.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { suppliers, variants } from "@/db/schema";
import { requireShop } from "@/lib/auth";
import { safeMessage, ValidationError } from "@/lib/errors";
import { parseSupplierCsv } from "@/lib/supplier-csv";

/**
 * The shape every action here returns.
 *
 * Only async functions may be exported from a `"use server"` module — a plain object
 * export is undefined by the time a client component reads it, which is a
 * `Cannot read properties of undefined` at render time and a green build. The initial
 * value lives with the form that uses it.
 */
export interface SupplierState {
  error: string | null;
  note: string | null;
  /** Per-line problems from an import, shown in full rather than summarised away. */
  issues: string[];
}

export async function saveSupplierAction(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  const { shop } = await requireShop();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const leadTimeDays = Number(formData.get("leadTimeDays") ?? 14);
  const minOrder = Number(formData.get("minOrderValue") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();

  try {
    if (!name) throw new ValidationError("A supplier needs a name.");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new ValidationError("That email address does not look right.");
    }
    if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) {
      throw new ValidationError("Lead time has to be between 0 and 365 days.");
    }

    const db = getDb();
    const values = {
      shopId: shop.id,
      name,
      email: email || null,
      leadTimeDays: Math.round(leadTimeDays),
      minOrderValueCents: Math.max(0, Math.round((Number.isFinite(minOrder) ? minOrder : 0) * 100)),
      notes: notes || null,
    };

    if (id) {
      const updated = await db
        .update(suppliers)
        .set(values)
        .where(and(eq(suppliers.id, id), eq(suppliers.shopId, shop.id)))
        .returning({ id: suppliers.id });
      if (!updated.length) throw new ValidationError("That supplier is not in this store.");
    } else {
      await db
        .insert(suppliers)
        .values(values)
        .onConflictDoUpdate({ target: [suppliers.shopId, suppliers.name], set: values });
    }

    revalidatePath("/suppliers");
    revalidatePath("/reorder");
    return {
      error: null,
      note: `Saved ${name} · ${values.leadTimeDays}-day lead time. Reorder points use it on the next run.`,
      issues: [],
    };
  } catch (err) {
    return { error: safeMessage(err, "That supplier could not be saved."), note: null, issues: [] };
  }
}

/** Assign a supplier, MOQ and pack size to one SKU from the SKU list. */
export async function assignSupplierAction(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  const { shop } = await requireShop();
  const variantId = String(formData.get("variantId") ?? "");
  const supplierId = String(formData.get("supplierId") ?? "");
  const moq = Number(formData.get("moq") ?? 0);
  const packSize = Number(formData.get("packSize") ?? 1);

  try {
    const db = getDb();
    if (supplierId) {
      const [supplier] = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.id, supplierId), eq(suppliers.shopId, shop.id)))
        .limit(1);
      if (!supplier) throw new ValidationError("That supplier is not in this store.");
    }

    const updated = await db
      .update(variants)
      .set({
        supplierId: supplierId || null,
        moq: Math.max(0, Math.round(Number.isFinite(moq) ? moq : 0)),
        packSize: Math.max(1, Math.round(Number.isFinite(packSize) ? packSize : 1)),
      })
      .where(and(eq(variants.id, variantId), eq(variants.shopId, shop.id)))
      .returning({ sku: variants.sku });
    if (!updated.length) throw new ValidationError("That SKU is not in this store.");

    revalidatePath("/suppliers");
    revalidatePath("/reorder");
    return { error: null, note: `Updated ${updated[0].sku}.`, issues: [] };
  } catch (err) {
    return { error: safeMessage(err, "That SKU could not be updated."), note: null, issues: [] };
  }
}

/**
 * Import lead times, costs, MOQs and pack sizes from a CSV.
 *
 * Suppliers named in the file are created if they do not exist, so a merchant can
 * arrive with one spreadsheet and be done. Rows whose SKU is not in the catalogue are
 * reported by line number, not dropped: "89 of 92 rows applied" with the three
 * missing SKUs named is actionable; "imported" is not.
 */
export async function importSupplierCsvAction(
  _prev: SupplierState,
  formData: FormData,
): Promise<SupplierState> {
  const { shop } = await requireShop();
  const pasted = String(formData.get("csv") ?? "");
  const file = formData.get("file");
  let text = pasted;

  if (!text.trim() && file instanceof File && file.size > 0) {
    if (file.size > 2_000_000) {
      return { error: "That file is larger than 2 MB.", note: null, issues: [] };
    }
    text = await file.text();
  }
  if (!text.trim()) {
    return { error: "Paste the rows or choose a CSV file first.", note: null, issues: [] };
  }

  const parsed = parseSupplierCsv(text);
  if (!parsed.rows.length) {
    return {
      error: parsed.errors[0] ?? "Nothing in that file could be read.",
      note: null,
      issues: parsed.errors.slice(1, 12),
    };
  }

  const db = getDb();
  const issues = [...parsed.errors];
  let applied = 0;
  let suppliersTouched = 0;
  const supplierIds = new Map<string, string>();

  try {
    for (const row of parsed.rows) {
      let supplierId: string | null = null;
      if (row.supplierName) {
        const cached = supplierIds.get(row.supplierName);
        if (cached) {
          supplierId = cached;
        } else {
          const [supplier] = await db
            .insert(suppliers)
            .values({
              shopId: shop.id,
              name: row.supplierName,
              email: row.supplierEmail,
              leadTimeDays: row.leadTimeDays ?? 14,
              minOrderValueCents: row.minOrderValueCents ?? 0,
            })
            .onConflictDoUpdate({
              target: [suppliers.shopId, suppliers.name],
              set: {
                // Only overwrite what the file actually carried.
                email: row.supplierEmail ?? undefined,
                leadTimeDays: row.leadTimeDays ?? undefined,
                minOrderValueCents: row.minOrderValueCents ?? undefined,
              },
            })
            .returning({ id: suppliers.id });
          supplierId = supplier.id;
          supplierIds.set(row.supplierName, supplierId);
          suppliersTouched += 1;
        }
      }

      const updated = await db
        .update(variants)
        .set({
          supplierId: supplierId ?? undefined,
          costCents: row.costCents ?? undefined,
          moq: row.moq ?? undefined,
          packSize: row.packSize !== null ? Math.max(1, row.packSize) : undefined,
        })
        .where(and(eq(variants.shopId, shop.id), eq(variants.sku, row.sku)))
        .returning({ id: variants.id });

      if (updated.length) applied += updated.length;
      else issues.push(`Line ${row.line}: no SKU "${row.sku}" in this store's catalogue.`);
    }
  } catch (err) {
    return { error: safeMessage(err, "The import stopped part-way."), note: null, issues };
  }

  revalidatePath("/suppliers");
  revalidatePath("/reorder");
  return {
    error: null,
    note: `${applied} of ${parsed.rows.length} rows applied · ${suppliersTouched} supplier${suppliersTouched === 1 ? "" : "s"} created or updated. Forecasts pick the new lead times up on the next run.`,
    issues: issues.slice(0, 12),
  };
}
