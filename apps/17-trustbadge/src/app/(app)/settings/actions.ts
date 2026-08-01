"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMerchant } from "@/lib/auth";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { NotFoundError, PlanLimitError, ValidationError } from "@/lib/errors";
import { runImport } from "@/lib/import-run";
import { approveImported } from "@/lib/import-run";
import { rotatePublicKey, updateStoreSettings } from "@/lib/stores";
import { revalidateStoreReviews } from "@/lib/widget-data";
import type { Tier } from "@/db/schema";

export interface SettingsState {
  error?: string;
  ok?: string;
}

export async function saveStoreAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { merchant, store } = await requireMerchant();
  const num = (key: string): number | undefined => {
    const raw = formData.get(key);
    if (raw == null || raw === "") return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };

  try {
    await updateStoreSettings(store.id, merchant.id, {
      name: String(formData.get("name") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      requestDelayDays: num("requestDelayDays"),
      autoPublishMinRating: num("autoPublishMinRating"),
      requestsEnabled: formData.get("requestsEnabled") === "on",
      incentiveEnabled: formData.get("incentiveEnabled") === "on",
      incentivePercent: num("incentivePercent"),
      incentivePrefix: String(formData.get("incentivePrefix") ?? ""),
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof NotFoundError) {
      return { error: err.message };
    }
    console.error("[settings] save failed", err);
    return { error: "Could not save those settings" };
  }

  // The store name and the auto-publish threshold both appear in widget output.
  revalidateStoreReviews(store.id);
  revalidatePath("/settings");
  revalidatePath("/home");
  return { ok: "Saved." };
}

export async function rotateKeyAction(): Promise<void> {
  const { merchant, store } = await requireMerchant();
  await rotatePublicKey(store.id, merchant.id);
  revalidatePath("/settings/install");
  revalidatePath("/widgets");
}

export async function upgradeAction(formData: FormData): Promise<void> {
  const { merchant } = await requireMerchant();
  const tier = String(formData.get("tier") ?? "") as Exclude<Tier, "free">;
  let url: string;
  try {
    url = await createCheckoutSession(merchant, tier);
  } catch (err) {
    console.error("[billing] checkout failed", err);
    redirect("/settings/billing?error=checkout");
  }
  redirect(url);
}

export async function portalAction(): Promise<void> {
  const { merchant } = await requireMerchant();
  let url: string;
  try {
    url = await createPortalSession(merchant);
  } catch (err) {
    console.error("[billing] portal failed", err);
    redirect("/settings/billing?error=portal");
  }
  redirect(url);
}

export interface ImportState {
  error?: string;
  ok?: string;
  requiredTier?: string | null;
  detail?: { imported: number; skipped: number; errors: { row: number; reason: string }[] };
}

export async function importAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const { merchant, store } = await requireMerchant();
  const file = formData.get("file");

  if (!(file instanceof File) || !file.size) {
    return { error: "Choose an export file first" };
  }
  // 8MB of CSV is roughly 40,000 reviews; past that it needs to be a background job.
  if (file.size > 8 * 1024 * 1024) {
    return { error: "That file is over 8MB — split it and import in two passes" };
  }

  let text: string;
  try {
    text = await file.text();
  } catch {
    return { error: "Could not read that file" };
  }

  try {
    const result = await runImport({
      storeId: store.id,
      tier: merchant.tier,
      fileName: file.name,
      text,
    });
    revalidateStoreReviews(store.id);
    revalidatePath("/settings/import");
    revalidatePath("/reviews");
    revalidatePath("/home");
    return {
      ok:
        result.imported === 0 && result.skipped > 0
          ? "Every review in that file was already here — nothing was duplicated."
          : `Imported ${result.imported} review${result.imported === 1 ? "" : "s"}. They are waiting in moderation.`,
      detail: { imported: result.imported, skipped: result.skipped, errors: result.errors },
    };
  } catch (err) {
    if (err instanceof PlanLimitError) {
      return { error: err.message, requiredTier: err.requiredTier };
    }
    console.error("[import] failed", err);
    return { error: "Could not import that file" };
  }
}

export async function approveImportAction(formData: FormData): Promise<void> {
  const { store } = await requireMerchant();
  await approveImported(store.id, String(formData.get("jobId")));
  revalidateStoreReviews(store.id);
  revalidatePath("/settings/import");
  revalidatePath("/reviews");
}
