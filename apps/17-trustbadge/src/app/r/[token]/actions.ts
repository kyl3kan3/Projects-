"use server";

import { requireRequest } from "@/lib/submission";
import { ValidationError } from "@/lib/errors";
import { submitReview } from "@/lib/reviews";
import { featureAllowed } from "@/lib/plans";
import { revalidateStoreReviews } from "@/lib/widget-data";
import { MAX_PHOTO_BYTES } from "@/lib/media";

export interface SubmitState {
  error?: string;
  done?: {
    autoPublished: boolean;
    incentiveCode: string | null;
    disclosure: string | null;
    percentOff: number;
    photoAccepted: boolean;
  };
}

/**
 * Submitting a review from the tokenised form.
 *
 * There is no session here — the token *is* the authorisation, and it identifies
 * exactly one order, which is what makes the review a verified purchase. It is
 * deliberately not consumed on submit: a shopper who reloads should see their own
 * review, not an error, and the funnel already records the submission.
 */
export async function submitReviewAction(
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const token = String(formData.get("token") ?? "");
  const context = await requireRequest(token);
  if (!context) return { error: "That review link is not valid any more." };

  const { request, order, store, tier } = context;

  const rating = Number(formData.get("rating"));
  const body = String(formData.get("body") ?? "");
  const title = String(formData.get("title") ?? "");
  const authorName = String(formData.get("authorName") ?? "") || order.customerName || "";
  const productExternalId = String(formData.get("productExternalId") ?? "") || null;

  let photo: { bytes: Buffer; contentType: string } | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_PHOTO_BYTES) {
      return { error: "That photo is over 8MB — a phone photo at normal quality is fine." };
    }
    photo = {
      bytes: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
    };
  }

  const product = order.lineItems.find((item) => item.externalId === productExternalId);

  try {
    const result = await submitReview({
      store,
      tier,
      requestId: request.id,
      orderId: order.id,
      authorEmail: order.customerEmail,
      input: {
        rating,
        title,
        body,
        authorName,
        productExternalId,
        productTitle: product?.title ?? order.lineItems[0]?.title ?? null,
        photo,
      },
    });

    // An auto-published review has to reach the storefront now, not in five minutes.
    if (result.autoPublished) revalidateStoreReviews(store.id);

    return {
      done: {
        autoPublished: result.autoPublished,
        incentiveCode: result.incentiveCode,
        disclosure: result.disclosure,
        percentOff: store.incentivePercent,
        photoAccepted: Boolean(result.photo),
      },
    };
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    console.error("[submission] failed", err);
    return { error: "Something went wrong saving that. Your words are still in the form." };
  }
}

/** Whether this store can accept a photo at all — the form hides the step if not. */
export async function photoStepAvailable(tier: Parameters<typeof featureAllowed>[0]): Promise<boolean> {
  return featureAllowed(tier, "photoReviews");
}
