"use server";

import { revalidatePath } from "next/cache";
import { requireMerchant } from "@/lib/auth";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { bulkSetStatus, replyToReview, setReviewStatus } from "@/lib/reviews";
import { sendNow } from "@/lib/requests";
import { revalidateStoreReviews } from "@/lib/widget-data";

export interface ModerationState {
  error?: string;
  ok?: string;
}

/**
 * Every moderation action purges the store's widget cache before it returns.
 *
 * This is the part that is easy to leave out and impossible to notice in
 * development: without it a hidden review keeps being served from the edge for up
 * to five minutes, which for a review a merchant just rejected is exactly five
 * minutes too long.
 */
function published(storeId: string): void {
  revalidateStoreReviews(storeId);
  revalidatePath("/reviews");
  revalidatePath("/home");
  revalidatePath("/widgets");
}

export async function approveAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  await setReviewStatus(String(formData.get("id")), store.id, "approved");
  published(store.id);
}

export async function hideAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  await setReviewStatus(String(formData.get("id")), store.id, "rejected");
  published(store.id);
}

export async function restoreAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  await setReviewStatus(String(formData.get("id")), store.id, "pending");
  published(store.id);
}

export async function approveAllAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  const ids = String(formData.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!ids.length) return;
  await bulkSetStatus(store.id, ids, "approved");
  published(store.id);
}

export async function replyAction(
  _prev: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const { store } = await requireMerchant();
  try {
    await replyToReview(String(formData.get("id")), store.id, String(formData.get("reply") ?? ""));
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) {
      return { error: err.message };
    }
    console.error("[reviews] reply failed", err);
    return { error: "Could not save that reply" };
  }
  published(store.id);
  return { ok: "Reply published with the review." };
}

export async function sendRequestNowAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  await sendNow(String(formData.get("id")), store.id);
  revalidatePath("/reviews");
  revalidatePath("/home");
}
