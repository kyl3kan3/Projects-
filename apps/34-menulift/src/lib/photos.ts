/**
 * The dish-photo flow, database side: upload, enhance, review, approve.
 *
 * The rule that shapes this file: **nothing an owner has not looked at reaches a
 * guest.** The public read path only returns photos with `status = approved`
 * (src/lib/menu-data.ts), and the only writer of that status is
 * {@link approvePhoto}, which is only reachable from the review card. A rejected
 * candidate keeps the original so the owner can retake or try again; the original
 * is never overwritten by anything.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { itemPhotos, locations, menuItems, menuSections, menus, type ItemPhoto } from "@/db/schema";
import { revalidatePublicMenu } from "@/lib/menu-data";
import { log } from "@/lib/menus";
import { getEnhancer } from "@/lib/photo-pipeline";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  deleteObjects,
  enhancedKey,
  getObject,
  originalKey,
  photoUrl,
  putObject,
} from "@/lib/storage";
import type { Actor } from "@/lib/auth";

/** Derivative key for the 64px row slot, alongside the enhanced candidate. */
export function thumbKey(locationId: string, photoId: string): string {
  return `${locationId}/${photoId}/thumb.webp`;
}

export interface UploadResult {
  photoId: string;
  status: string;
  note: string | null;
  error: string | null;
}

/**
 * Take a phone snap, store the original, run the enhancement pass, and leave a
 * candidate awaiting review.
 *
 * The enhancement runs inline rather than on a queue. ARCHITECTURE.md calls for
 * BullMQ, but the deployment target has no always-on process (root DEPLOYING.md),
 * and one photo is a bounded few seconds — well inside a function's budget. The
 * status column still moves pending -> processing -> ready, so moving this onto a
 * worker later changes no reader.
 */
export async function uploadAndEnhance(
  itemId: string,
  file: { bytes: Buffer; contentType: string; filename?: string },
  actor: Actor,
): Promise<UploadResult> {
  const db = getDb();
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, itemId));
  if (!item) throw new Error("That dish no longer exists");

  if (file.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${(file.bytes.byteLength / 1_048_576).toFixed(1)}MB. The limit is ${
        MAX_UPLOAD_BYTES / 1_048_576
      }MB — a photo straight off a phone is fine, a screen recording is not.`,
    );
  }
  const contentType = normaliseContentType(file.contentType, file.filename);
  if (!ALLOWED_IMAGE_TYPES.includes(contentType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new Error(`We can't read ${contentType || "that file type"}. JPEG, PNG or WebP.`);
  }

  const photoId = randomUUID();
  const origKey = originalKey(item.locationId, photoId, contentType);
  await putObject(origKey, file.bytes, contentType);

  await db.insert(itemPhotos).values({
    id: photoId,
    menuItemId: itemId,
    locationId: item.locationId,
    originalKey: origKey,
    status: "processing",
    shotAt: new Date(),
  });

  const enhancer = getEnhancer();
  const result = await enhancer.enhance({ bytes: file.bytes, contentType });

  if (!result.ok) {
    // Honest failure. The original stays, so "retake" is a real option and the
    // owner is not left wondering what happened.
    await db
      .update(itemPhotos)
      .set({
        status: "failed",
        error: result.reason,
        provider: result.provider,
        enhanceMs: result.durationMs,
        enhancedAt: new Date(),
      })
      .where(eq(itemPhotos.id, photoId));
    await log(item.locationId, itemId, item.name, actor, "photo.failed", null, result.reason);
    return { photoId, status: "failed", note: null, error: result.reason };
  }

  const enhKey = enhancedKey(item.locationId, photoId);
  await putObject(enhKey, result.enhanced, result.enhancedContentType);
  await putObject(thumbKey(item.locationId, photoId), result.thumb, result.thumbContentType);

  await db
    .update(itemPhotos)
    .set({
      status: "ready",
      enhancedKey: enhKey,
      note: result.note,
      provider: result.provider,
      providerRef: result.providerRef,
      enhanceMs: result.durationMs,
      enhancedAt: new Date(),
      error: null,
    })
    .where(eq(itemPhotos.id, photoId));

  await log(item.locationId, itemId, item.name, actor, "photo.enhanced", null, result.note);
  return { photoId, status: "ready", note: result.note, error: null };
}

/** Browsers sometimes send an empty type for HEIC; fall back to the extension. */
function normaliseContentType(contentType: string, filename?: string): string {
  const given = (contentType || "").toLowerCase().split(";")[0].trim();
  if (given && given !== "application/octet-stream") return given;
  const ext = (filename ?? "").toLowerCase().split(".").pop();
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
    case "heif":
      return "image/heic";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return given;
  }
}

/** Approve: attach to the item and purge the guest page. */
export async function approvePhoto(photoId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [photo] = await db.select().from(itemPhotos).where(eq(itemPhotos.id, photoId));
  if (!photo) throw new Error("That photo no longer exists");
  if (photo.status !== "ready") {
    throw new Error("Only a finished candidate can be approved.");
  }

  const now = new Date();
  await db
    .update(itemPhotos)
    .set({ status: "approved", decidedAt: now })
    .where(eq(itemPhotos.id, photoId));

  // One live photo per dish: any previously approved photo steps aside.
  const superseded = await db
    .select()
    .from(itemPhotos)
    .where(
      and(
        eq(itemPhotos.menuItemId, photo.menuItemId),
        eq(itemPhotos.status, "approved"),
      ),
    );
  const stale = superseded.filter((p) => p.id !== photoId).map((p) => p.id);
  if (stale.length) {
    await db
      .update(itemPhotos)
      .set({ status: "rejected", decidedAt: now })
      .where(inArray(itemPhotos.id, stale));
  }

  await db
    .update(menuItems)
    .set({ photoId, updatedAt: now })
    .where(eq(menuItems.id, photo.menuItemId));

  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, photo.menuItemId));
  await log(photo.locationId, photo.menuItemId, item?.name ?? null, actor, "photo.approved", null, "live");

  const slug = await slugFor(photo.locationId);
  if (slug) revalidatePublicMenu(slug);
}

/** Reject: the candidate goes away, the original stays for a retake. */
export async function rejectPhoto(photoId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [photo] = await db.select().from(itemPhotos).where(eq(itemPhotos.id, photoId));
  if (!photo) return;

  const now = new Date();
  await db
    .update(itemPhotos)
    .set({ status: "rejected", decidedAt: now })
    .where(eq(itemPhotos.id, photoId));

  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, photo.menuItemId));
  // If the rejected photo was the live one, the dish goes back to no photo.
  if (item?.photoId === photoId) {
    await db.update(menuItems).set({ photoId: null, updatedAt: now }).where(eq(menuItems.id, item.id));
    const slug = await slugFor(photo.locationId);
    if (slug) revalidatePublicMenu(slug);
  }
  await log(photo.locationId, photo.menuItemId, item?.name ?? null, actor, "photo.rejected", null, "retake");
}

/** Delete a photo and its objects entirely. */
export async function deletePhoto(photoId: string, actor: Actor): Promise<void> {
  const db = getDb();
  const [photo] = await db.select().from(itemPhotos).where(eq(itemPhotos.id, photoId));
  if (!photo) return;
  const [item] = await db.select().from(menuItems).where(eq(menuItems.id, photo.menuItemId));
  if (item?.photoId === photoId) {
    await db.update(menuItems).set({ photoId: null, updatedAt: new Date() }).where(eq(menuItems.id, item.id));
  }
  await db.delete(itemPhotos).where(eq(itemPhotos.id, photoId));
  await deleteObjects(
    [photo.originalKey, photo.enhancedKey, thumbKey(photo.locationId, photoId)].filter(
      (k): k is string => !!k,
    ),
  );
  await log(photo.locationId, photo.menuItemId, item?.name ?? null, actor, "photo.deleted", null, null);
  const slug = await slugFor(photo.locationId);
  if (slug) revalidatePublicMenu(slug);
}

async function slugFor(locationId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db.select({ slug: locations.slug }).from(locations).where(eq(locations.id, locationId));
  return row?.slug ?? null;
}

export interface ReviewCard {
  photo: ItemPhoto;
  itemId: string;
  itemName: string;
  sectionName: string;
  menuName: string;
  originalUrl: string;
  enhancedUrl: string | null;
}

/** The review queue: newest first, everything not yet decided plus failures. */
export async function reviewQueue(locationId: string): Promise<ReviewCard[]> {
  const db = getDb();
  const rows = await db
    .select({
      photo: itemPhotos,
      itemId: menuItems.id,
      itemName: menuItems.name,
      sectionName: menuSections.name,
      menuName: menus.name,
    })
    .from(itemPhotos)
    .innerJoin(menuItems, eq(menuItems.id, itemPhotos.menuItemId))
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(
      and(
        eq(itemPhotos.locationId, locationId),
        inArray(itemPhotos.status, ["pending", "processing", "ready", "failed"]),
      ),
    )
    .orderBy(desc(itemPhotos.createdAt));

  return rows.map((r) => ({
    photo: r.photo,
    itemId: r.itemId,
    itemName: r.itemName,
    sectionName: r.sectionName,
    menuName: r.menuName,
    originalUrl: photoUrl(r.photo.originalKey),
    enhancedUrl: r.photo.enhancedKey ? photoUrl(r.photo.enhancedKey) : null,
  }));
}

/** Photos already live, so the owner can replace or remove one. */
export async function livePhotos(locationId: string): Promise<ReviewCard[]> {
  const db = getDb();
  const rows = await db
    .select({
      photo: itemPhotos,
      itemId: menuItems.id,
      itemName: menuItems.name,
      sectionName: menuSections.name,
      menuName: menus.name,
    })
    .from(itemPhotos)
    .innerJoin(menuItems, eq(menuItems.id, itemPhotos.menuItemId))
    .innerJoin(menuSections, eq(menuSections.id, menuItems.sectionId))
    .innerJoin(menus, eq(menus.id, menuSections.menuId))
    .where(and(eq(itemPhotos.locationId, locationId), eq(itemPhotos.status, "approved")))
    .orderBy(desc(itemPhotos.decidedAt));

  return rows.map((r) => ({
    photo: r.photo,
    itemId: r.itemId,
    itemName: r.itemName,
    sectionName: r.sectionName,
    menuName: r.menuName,
    originalUrl: photoUrl(r.photo.originalKey),
    enhancedUrl: r.photo.enhancedKey ? photoUrl(r.photo.enhancedKey) : null,
  }));
}

/** Serve one stored object, with the ownership check the route needs. */
export async function readPhotoObject(key: string) {
  return getObject(key);
}
