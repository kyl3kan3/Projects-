"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { itemPhotos, menuItems } from "@/db/schema";
import { requireUser, type Actor } from "@/lib/auth";
import { approvePhoto, deletePhoto, rejectPhoto, uploadAndEnhance } from "@/lib/photos";
import { MAX_UPLOAD_BYTES } from "@/lib/storage";
import { featureAllowed, planRequiredFor } from "@/lib/plans";
import type { PhotoState } from "./state";

async function context(): Promise<{ actor: Actor; locationId: string; plan: string }> {
  const ctx = await requireUser();
  return {
    actor: { userId: ctx.user.id, label: ctx.user.name || ctx.user.email.split("@")[0] },
    locationId: ctx.location.id,
    plan: ctx.organization.plan,
  };
}

async function assertPhoto(photoId: string, locationId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: itemPhotos.id })
    .from(itemPhotos)
    .where(and(eq(itemPhotos.id, photoId), eq(itemPhotos.locationId, locationId)));
  if (!row) throw new Error("That photo is not at this location");
}

export async function uploadPhotoAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  try {
    const { actor, locationId, plan } = await context();
    if (!featureAllowed(plan, "photoEnhancement")) {
      return {
        error: `Photo enhancement is on the ${planRequiredFor("photoEnhancement").name} plan.`,
        ok: null,
      };
    }

    const itemId = String(formData.get("itemId") ?? "");
    const db = getDb();
    const [item] = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.id, itemId), eq(menuItems.locationId, locationId)));
    if (!item) return { error: "Pick a dish for the photo", ok: null };

    const file = formData.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Choose a photo to upload", ok: null };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        error: `That file is ${(file.size / 1_048_576).toFixed(1)}MB — the limit is ${
          MAX_UPLOAD_BYTES / 1_048_576
        }MB.`,
        ok: null,
      };
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadAndEnhance(
      itemId,
      { bytes, contentType: file.type, filename: file.name },
      actor,
    );

    revalidatePath("/photos");
    revalidatePath("/menu");
    if (result.status === "failed") {
      // Not an error state for the *upload* — the original is stored and the queue
      // shows the honest reason. Say so plainly rather than pretending it worked.
      return { error: result.error, ok: null };
    }
    return { error: null, ok: "Enhanced — review it below before it goes live" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not process that photo", ok: null };
  }
}

/**
 * Approve, then redirect with a flash.
 *
 * Returning `{ ok: "Live on the guest menu" }` looked right and did nothing: an
 * approved photo leaves the review queue, so the card holding that message
 * unmounts the instant the page revalidates, and the owner taps Approve and
 * watches the card silently vanish. The confirmation has to outlive the component,
 * so it travels in the URL.
 *
 * The redirect is issued *outside* the try block on purpose — `redirect()` works by
 * throwing, and catching it would turn a success into "Could not approve".
 */
export async function approvePhotoAction(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  let approvedName: string;
  try {
    const { actor, locationId } = await context();
    const photoId = String(formData.get("photoId") ?? "");
    await assertPhoto(photoId, locationId);

    const db = getDb();
    const [row] = await db
      .select({ name: menuItems.name })
      .from(itemPhotos)
      .innerJoin(menuItems, eq(menuItems.id, itemPhotos.menuItemId))
      .where(eq(itemPhotos.id, photoId));

    await approvePhoto(photoId, actor);
    revalidatePath("/photos");
    revalidatePath("/menu");
    approvedName = row?.name ?? "That photo";
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not approve that photo", ok: null };
  }
  redirect(`/photos?approved=${encodeURIComponent(approvedName)}`);
}

export async function rejectPhotoAction(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  try {
    const { actor, locationId } = await context();
    const photoId = String(formData.get("photoId") ?? "");
    await assertPhoto(photoId, locationId);
    await rejectPhoto(photoId, actor);
    revalidatePath("/photos");
    revalidatePath("/menu");
    return { error: null, ok: "Rejected — the original is still there for a retake" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not reject that photo", ok: null };
  }
}

export async function deletePhotoAction(_prev: PhotoState, formData: FormData): Promise<PhotoState> {
  try {
    const { actor, locationId } = await context();
    const photoId = String(formData.get("photoId") ?? "");
    await assertPhoto(photoId, locationId);
    await deletePhoto(photoId, actor);
    revalidatePath("/photos");
    revalidatePath("/menu");
    return { error: null, ok: "Photo deleted" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete that photo", ok: null };
  }
}
