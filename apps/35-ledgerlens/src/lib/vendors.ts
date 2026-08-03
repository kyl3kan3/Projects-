/**
 * Vendor records and the learned rules.
 *
 * The retention story of this product is that month six is quieter than month one:
 * every correction an operator makes becomes a permanent per-vendor default, so the
 * same receipt never asks twice. That is this file.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, vendors, type Category, type Vendor } from "@/db/schema";
import { displayNameFor, normalizeVendor } from "@/lib/categorize";
import { audit } from "@/lib/audit";

export interface VendorWithRule {
  vendor: Vendor;
  /** The learned category, resolved to its slug. Null when no rule exists yet. */
  ruleSlug: string | null;
}

/** Find-or-create by normalized name; never creates a second row for "#1234". */
export async function upsertVendor(
  organizationId: string,
  rawName: string,
): Promise<VendorWithRule> {
  const db = getDb();
  const normalizedName = normalizeVendor(rawName);
  if (!normalizedName) {
    throw new Error("Cannot create a vendor from an empty name");
  }
  const displayName = displayNameFor(rawName, normalizedName);

  await db
    .insert(vendors)
    .values({ organizationId, displayName, normalizedName })
    .onConflictDoNothing({ target: [vendors.organizationId, vendors.normalizedName] });

  const [row] = await db
    .select({ vendor: vendors, categorySlug: categories.slug })
    .from(vendors)
    .leftJoin(categories, eq(categories.id, vendors.defaultCategoryId))
    .where(
      and(eq(vendors.organizationId, organizationId), eq(vendors.normalizedName, normalizedName)),
    );

  return { vendor: row.vendor, ruleSlug: row.categorySlug ?? null };
}

export async function bumpVendorDocumentCount(vendorId: string): Promise<void> {
  await getDb()
    .update(vendors)
    .set({ documentCount: sql`${vendors.documentCount} + 1`, updatedAt: sql`now()` })
    .where(eq(vendors.id, vendorId));
}

/**
 * Teach the rule. A correction always wins over whatever was there before —
 * including a previous correction, because the operator is the authority on their
 * own books and the most recent answer is the current one.
 */
export async function learnFromCorrection(
  organizationId: string,
  vendorId: string,
  categoryId: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(vendors)
    .set({ defaultCategoryId: categoryId, ruleSource: "correction", updatedAt: sql`now()` })
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
    .returning();
  if (!updated) return;
  const [category] = await db.select().from(categories).where(eq(categories.id, categoryId));
  await audit(organizationId, actor, "vendor.rule_learned", vendorId, {
    vendor: updated.displayName,
    category: category?.name ?? categoryId,
  });
}

export async function listVendorsWithRules(
  organizationId: string,
): Promise<{ vendor: Vendor; category: Category | null }[]> {
  const rows = await getDb()
    .select({ vendor: vendors, category: categories })
    .from(vendors)
    .leftJoin(categories, eq(categories.id, vendors.defaultCategoryId))
    .where(eq(vendors.organizationId, organizationId))
    .orderBy(sql`${vendors.documentCount} desc`, vendors.displayName);
  return rows.map((r) => ({ vendor: r.vendor, category: r.category }));
}
