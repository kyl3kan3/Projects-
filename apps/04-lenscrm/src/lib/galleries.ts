/**
 * Gallery helpers: quota enforcement and delivery. Uploads go direct to R2
 * via presigned PUT; the worker generates derivatives and rolls up bytes
 * (quota enforced there). Delivery serves web-size via CDN or originals via
 * short-lived presigned GETs, per the gallery's download policy.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export async function galleryHasQuota(accountId: string, addBytes: number): Promise<boolean> {
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId) });
  if (!account) return false;
  return account.storageUsedBytes + addBytes <= account.storageQuotaBytes;
}

export async function addBytes(accountId: string, galleryId: string, bytes: number): Promise<void> {
  await db.update(schema.accounts).set({ storageUsedBytes: sql`${schema.accounts.storageUsedBytes} + ${bytes}` }).where(eq(schema.accounts.id, accountId));
  await db.update(schema.galleries).set({ totalBytes: sql`${schema.galleries.totalBytes} + ${bytes}` }).where(eq(schema.galleries.id, galleryId));
}

export interface ProofSummary { favorites: number; finalPicks: number; }
export async function proofSummary(galleryId: string): Promise<ProofSummary> {
  const rows = await db
    .select({ set: schema.imageSelections.selectionSet, n: sql<number>`count(*)` })
    .from(schema.imageSelections)
    .where(eq(schema.imageSelections.galleryId, galleryId))
    .groupBy(schema.imageSelections.selectionSet);
  const favorites = Number(rows.find((r) => r.set === "favorites")?.n ?? 0);
  const finalPicks = Number(rows.find((r) => r.set === "finalPicks")?.n ?? 0);
  return { favorites, finalPicks };
}

export async function toggleFavorite(galleryId: string, galleryImageId: string, visitor: string): Promise<boolean> {
  const existing = await db.query.imageSelections.findFirst({
    where: and(
      eq(schema.imageSelections.galleryImageId, galleryImageId),
      eq(schema.imageSelections.selectedBy, visitor),
      eq(schema.imageSelections.selectionSet, "favorites"),
    ),
  });
  if (existing) {
    await db.delete(schema.imageSelections).where(eq(schema.imageSelections.id, existing.id));
    return false;
  }
  await db.insert(schema.imageSelections).values({ galleryId, galleryImageId, selectedBy: visitor, selectionSet: "favorites" });
  return true;
}
