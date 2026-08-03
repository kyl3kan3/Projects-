/**
 * The review queue: one document at a time, one tap to rule it off.
 *
 * The rule this file enforces is the product's promise made mechanical:
 * `confirmDocument` is the *only* code path that sets `line_items.confirmed_at`, and
 * `confirmed_at` is the only thing the export layer trusts. A figure gets into a
 * close package because a human said yes to it or because every field cleared the
 * auto threshold — there is no third way in.
 *
 * A correction to the category also writes the vendor rule, which is why review
 * volume falls month over month instead of staying constant.
 */

import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  categories,
  documents,
  extractions,
  lineItems,
  reviewItems,
  vendors,
  type Category,
  type DocumentRow,
  type Extraction,
  type LineItem,
  type ReviewField,
  type ReviewItem,
  type Vendor,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { isIsoDate } from "@/lib/dates";
import { ValidationError } from "@/lib/errors";
import { CATEGORY_SLUGS, normalizeVendor } from "@/lib/categorize";
import { learnFromCorrection, upsertVendor } from "@/lib/vendors";
import { openReviewCounts, displayStatus, type DisplayStatus } from "@/lib/documents";
import { parseAmountToCents } from "@/lib/money";

export interface ReviewSheet {
  document: DocumentRow;
  lineItem: LineItem | null;
  extraction: Extraction | null;
  vendor: Vendor | null;
  category: Category | null;
  open: ReviewItem[];
  resolved: ReviewItem[];
  duplicateCandidate: { document: DocumentRow; lineItem: LineItem | null } | null;
  status: DisplayStatus;
}

export async function loadReviewSheet(
  organizationId: string,
  documentId: string,
  opts: { atCap?: boolean } = {},
): Promise<ReviewSheet | null> {
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
  if (!document) return null;

  const [lineItem] = await db.select().from(lineItems).where(eq(lineItems.documentId, documentId));
  const [extraction] = await db
    .select()
    .from(extractions)
    .where(eq(extractions.documentId, documentId))
    .orderBy(desc(extractions.createdAt))
    .limit(1);
  const items = await db
    .select()
    .from(reviewItems)
    .where(eq(reviewItems.documentId, documentId))
    .orderBy(asc(reviewItems.createdAt));

  const vendor = lineItem?.vendorId
    ? (await db.select().from(vendors).where(eq(vendors.id, lineItem.vendorId)))[0] ?? null
    : null;
  const category = lineItem?.categoryId
    ? (await db.select().from(categories).where(eq(categories.id, lineItem.categoryId)))[0] ?? null
    : null;

  let duplicateCandidate: ReviewSheet["duplicateCandidate"] = null;
  const otherId = document.duplicateCandidateOfId ?? document.duplicateOfId;
  if (otherId) {
    const [other] = await db.select().from(documents).where(eq(documents.id, otherId));
    if (other) {
      const [otherLine] = await db
        .select()
        .from(lineItems)
        .where(eq(lineItems.documentId, other.id));
      duplicateCandidate = { document: other, lineItem: otherLine ?? null };
    }
  }

  const open = items.filter((i) => !i.resolvedAt);
  return {
    document,
    lineItem: lineItem ?? null,
    extraction: extraction ?? null,
    vendor,
    category,
    open,
    resolved: items.filter((i) => i.resolvedAt),
    duplicateCandidate,
    status: displayStatus({
      status: document.status,
      duplicateOfId: document.duplicateOfId,
      extractingSince: document.extractingSince,
      openReviewCount: open.length,
      hasLineItem: Boolean(lineItem),
      lineItemConfirmed: Boolean(lineItem?.confirmedAt),
      atCap: Boolean(opts.atCap),
    }),
  };
}

/** Document ids with unresolved fields, oldest first — the queue's order. */
export async function flaggedQueue(organizationId: string, limit = 50): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ id: documents.id, receivedAt: documents.receivedAt })
    .from(reviewItems)
    .innerJoin(documents, eq(documents.id, reviewItems.documentId))
    .where(and(eq(reviewItems.organizationId, organizationId), isNull(reviewItems.resolvedAt)))
    .orderBy(asc(documents.receivedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/* --------------------------------------------------------------- corrections --- */

export interface Corrections {
  vendor?: string;
  date?: string;
  /** As typed by the operator: "148.32", "$1,204.00". */
  total?: string;
  tax?: string;
  categorySlug?: string;
}

export interface ConfirmResult {
  documentId: string;
  correctedFields: ReviewField[];
  learnedRule: boolean;
}

/**
 * Confirm the entry — the settle rule.
 *
 * Every open review item is resolved: `corrected` when the operator changed the
 * value, `accepted` when they took the suggestion. Both are recorded, because the
 * accepted ones are the evidence that the thresholds are set right and the corrected
 * ones are the training signal.
 */
export async function confirmDocument(
  organizationId: string,
  userId: string,
  documentId: string,
  corrections: Corrections = {},
): Promise<ConfirmResult> {
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
  if (!document) throw new ValidationError("That document is no longer in your inbox.");
  if (document.duplicateOfId) {
    throw new ValidationError("This is a duplicate forward — there is nothing to confirm.");
  }
  const [existing] = await db.select().from(lineItems).where(eq(lineItems.documentId, documentId));
  if (!existing) {
    throw new ValidationError("This document has no reading yet. Re-run extraction first.");
  }

  const updates: Partial<typeof lineItems.$inferInsert> = {};
  const corrected: ReviewField[] = [];

  if (corrections.vendor !== undefined) {
    const raw = corrections.vendor.trim();
    if (!raw) throw new ValidationError("A vendor name is required.");
    // Compared normalised, so re-typing "Home Depot" over "HOME DEPOT #4412" is not
    // recorded as a correction — and does not create a second vendor row.
    const before = existing.vendorId ? await vendorName(existing.vendorId) : "";
    if (normalizeVendor(raw) !== normalizeVendor(before)) corrected.push("vendor");
    const { vendor } = await upsertVendor(organizationId, raw);
    updates.vendorId = vendor.id;
  }

  if (corrections.date !== undefined) {
    const value = corrections.date.trim();
    if (!isIsoDate(value)) throw new ValidationError("Enter the date as YYYY-MM-DD.");
    if (value !== existing.docDate) corrected.push("date");
    updates.docDate = value;
  }

  if (corrections.total !== undefined) {
    const cents = parseAmountToCents(corrections.total);
    if (cents === null) throw new ValidationError("Enter the total as a number, e.g. 148.32.");
    if (cents <= 0) throw new ValidationError("A total must be greater than zero.");
    if (cents !== existing.amountCents) corrected.push("total");
    updates.amountCents = cents;
  }

  if (corrections.tax !== undefined) {
    const raw = corrections.tax.trim();
    if (raw === "") {
      if (existing.taxCents !== null) corrected.push("tax");
      updates.taxCents = null;
    } else {
      const cents = parseAmountToCents(raw);
      if (cents === null) throw new ValidationError("Enter the tax as a number, e.g. 11.94.");
      if (cents < 0) throw new ValidationError("Tax cannot be negative.");
      if (cents !== existing.taxCents) corrected.push("tax");
      updates.taxCents = cents;
    }
  }

  let learnedRule = false;
  let categoryId = existing.categoryId;
  if (corrections.categorySlug !== undefined) {
    const slug = corrections.categorySlug;
    if (!CATEGORY_SLUGS.has(slug)) throw new ValidationError("Pick a category from the list.");
    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.slug, slug), isNull(categories.organizationId)));
    if (!category) throw new ValidationError("That category is not available.");
    if (category.id !== existing.categoryId) corrected.push("category");
    updates.categoryId = category.id;
    categoryId = category.id;
  }

  const amountCents = updates.amountCents ?? existing.amountCents;
  const taxCents = updates.taxCents === undefined ? existing.taxCents : updates.taxCents;
  if (taxCents !== null && taxCents > amountCents) {
    throw new ValidationError("Tax cannot be more than the total.");
  }

  await db
    .update(lineItems)
    .set({
      ...updates,
      confirmedBy: userId,
      confirmedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(lineItems.id, existing.id));

  // Resolve every open field. A field the operator did not touch was accepted —
  // that is a decision, and it is recorded as one.
  const open = await db
    .select()
    .from(reviewItems)
    .where(and(eq(reviewItems.documentId, documentId), isNull(reviewItems.resolvedAt)));
  for (const item of open) {
    const wasCorrected = corrected.includes(item.field);
    await db
      .update(reviewItems)
      .set({
        resolution: wasCorrected ? "corrected" : "accepted",
        resolvedValue: resolvedValueFor(item.field, {
          vendorId: updates.vendorId ?? existing.vendorId,
          docDate: updates.docDate ?? existing.docDate,
          amountCents,
          taxCents,
          categoryId,
        }),
        resolvedAt: sql`now()`,
      })
      .where(eq(reviewItems.id, item.id));
  }

  // The rule. Learned from a *correction* to the category — an accepted suggestion
  // teaches nothing, because the operator did not assert anything new.
  const vendorId = updates.vendorId ?? existing.vendorId;
  if (corrected.includes("category") && vendorId && categoryId) {
    await learnFromCorrection(organizationId, vendorId, categoryId, userId);
    learnedRule = true;
  }

  await db
    .update(documents)
    .set({ status: "confirmed", failureReason: null, updatedAt: sql`now()` })
    .where(eq(documents.id, documentId));

  await audit(organizationId, userId, "document.confirmed", documentId, {
    amountCents,
    corrected: corrected.length > 0,
    correctedFields: corrected,
  });

  return { documentId, correctedFields: corrected, learnedRule };
}

async function vendorName(vendorId: string): Promise<string> {
  const [row] = await getDb().select().from(vendors).where(eq(vendors.id, vendorId));
  return row?.displayName ?? "";
}

function resolvedValueFor(
  field: ReviewField,
  values: {
    vendorId: string | null;
    docDate: string;
    amountCents: number;
    taxCents: number | null;
    categoryId: string | null;
  },
): string | null {
  switch (field) {
    case "vendor":
      return values.vendorId;
    case "date":
      return values.docDate;
    case "total":
      return String(values.amountCents);
    case "tax":
      return values.taxCents === null ? null : String(values.taxCents);
    case "category":
      return values.categoryId;
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- rejection --- */

export async function rejectDocument(
  organizationId: string,
  userId: string,
  documentId: string,
): Promise<void> {
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
  if (!document) throw new ValidationError("That document is no longer in your inbox.");

  await db.delete(lineItems).where(eq(lineItems.documentId, documentId));
  await db
    .update(reviewItems)
    .set({ resolution: "skipped", resolvedAt: sql`now()` })
    .where(and(eq(reviewItems.documentId, documentId), isNull(reviewItems.resolvedAt)));
  await db
    .update(documents)
    .set({ status: "rejected", failureReason: "rejected_by_user", updatedAt: sql`now()` })
    .where(eq(documents.id, documentId));
  await audit(organizationId, userId, "document.rejected", documentId, { reason: "rejected_by_user" });
}

/* ------------------------------------------------------------------- merge --- */

/**
 * Merge a near-duplicate into the document it duplicates.
 *
 * The merged document keeps its original bytes forever — it is a financial record —
 * but loses its line item, so it stops counting toward any total, and its open review
 * items are closed as skipped so it stops asking.
 */
export async function mergeDuplicate(
  organizationId: string,
  userId: string,
  documentId: string,
): Promise<void> {
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
  if (!document) throw new ValidationError("That document is no longer in your inbox.");
  const intoId = document.duplicateCandidateOfId;
  if (!intoId) throw new ValidationError("This document has no duplicate to merge into.");

  await db.delete(lineItems).where(eq(lineItems.documentId, documentId));
  await db
    .update(reviewItems)
    .set({ resolution: "skipped", resolvedAt: sql`now()` })
    .where(and(eq(reviewItems.documentId, documentId), isNull(reviewItems.resolvedAt)));
  await db
    .update(documents)
    .set({
      status: "duplicate",
      duplicateOfId: intoId,
      duplicateCandidateOfId: null,
      updatedAt: sql`now()`,
    })
    .where(eq(documents.id, documentId));
  await audit(organizationId, userId, "document.merged", documentId, { into: intoId });
}

/** "These are two different purchases" — clear the flag and leave both entries. */
export async function dismissDuplicate(
  organizationId: string,
  userId: string,
  documentId: string,
): Promise<void> {
  const db = getDb();
  const [updated] = await db
    .update(documents)
    .set({ duplicateCandidateOfId: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.organizationId, organizationId),
        ne(documents.status, "duplicate"),
      ),
    )
    .returning({ id: documents.id });
  if (updated) {
    await audit(organizationId, userId, "document.duplicate_dismissed", documentId, {});
  }
}

/** Counts for the review screen header. */
export async function reviewProgress(
  organizationId: string,
): Promise<{ open: number; confirmedToday: number }> {
  const db = getDb();
  const openRows = await db
    .select({ n: sql<number>`count(distinct ${reviewItems.documentId})::int` })
    .from(reviewItems)
    .where(and(eq(reviewItems.organizationId, organizationId), isNull(reviewItems.resolvedAt)));
  const confirmedRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(lineItems)
    .where(
      and(
        eq(lineItems.organizationId, organizationId),
        sql`${lineItems.confirmedAt} >= date_trunc('day', now())`,
      ),
    );
  return {
    open: Number(openRows[0]?.n ?? 0),
    confirmedToday: Number(confirmedRows[0]?.n ?? 0),
  };
}

export { openReviewCounts };
