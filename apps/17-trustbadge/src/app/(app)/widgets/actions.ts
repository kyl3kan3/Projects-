"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMerchant } from "@/lib/auth";
import { NotFoundError, PlanLimitError, ValidationError } from "@/lib/errors";
import { createWidget, deleteWidget, updateWidgetSettings } from "@/lib/widgets";
import { revalidateStoreReviews } from "@/lib/widget-data";
import type { WidgetType } from "@/db/schema";

export interface WidgetFormState {
  error?: string;
  requiredTier?: string | null;
}

export async function createWidgetAction(
  _prev: WidgetFormState,
  formData: FormData,
): Promise<WidgetFormState> {
  const { merchant, store } = await requireMerchant();
  let id: string;
  try {
    const widget = await createWidget({
      storeId: store.id,
      tier: merchant.tier,
      type: String(formData.get("type") ?? "wall") as WidgetType,
      name: String(formData.get("name") ?? ""),
    });
    id = widget.id;
  } catch (err) {
    if (err instanceof PlanLimitError) return { error: err.message, requiredTier: err.requiredTier };
    if (err instanceof ValidationError) return { error: err.message };
    console.error("[widgets] create failed", err);
    return { error: "Could not create that widget" };
  }
  revalidatePath("/widgets");
  redirect(`/widgets/${id}`);
}

export async function updateWidgetAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  const id = String(formData.get("id"));

  const starColor = String(formData.get("starColor") ?? "");
  const radius = Number(formData.get("radius"));
  const font = String(formData.get("font") ?? "merchant");
  const maxReviews = Number(formData.get("maxReviews"));

  try {
    await updateWidgetSettings(id, store.id, {
      theme: {
        ...(starColor ? { starColor } : {}),
        ...(Number.isFinite(radius) ? { radius } : {}),
        font: font === "trustbadge" ? "trustbadge" : "merchant",
        motion: formData.get("motion") === "on",
      },
      layout: {
        ...(Number.isFinite(maxReviews) ? { maxReviews } : {}),
        showPhotos: formData.get("showPhotos") === "on",
        showReplies: formData.get("showReplies") === "on",
      },
      showBranding: formData.get("showBranding") === "on",
    });
  } catch (err) {
    if (err instanceof NotFoundError) redirect("/widgets");
    throw err;
  }

  // Theme changes are part of the cached widget payload, so the edge has to be
  // told as well — otherwise a merchant tweaks the star colour and sees nothing
  // change on their storefront for five minutes.
  revalidateStoreReviews(store.id);
  revalidatePath(`/widgets/${id}`);
  revalidatePath("/widgets");
}

export async function deleteWidgetAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  await deleteWidget(String(formData.get("id")), store.id);
  revalidateStoreReviews(store.id);
  revalidatePath("/widgets");
  redirect("/widgets");
}
