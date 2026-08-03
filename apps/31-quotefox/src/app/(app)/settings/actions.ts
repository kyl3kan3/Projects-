"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireOnboardedUser } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import type { DepositType } from "@/db/schema";

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { org, user } = await requireOnboardedUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Your company name goes on every proposal." };

  const markup = Number(String(formData.get("defaultMarkupPct") ?? ""));
  if (!Number.isFinite(markup) || markup < 0 || markup > 400) {
    return { error: "Markup should be a percentage between 0 and 400." };
  }
  const tax = Number(String(formData.get("taxRatePct") ?? ""));
  if (!Number.isFinite(tax) || tax < 0 || tax > 25) {
    return { error: "Sales tax should be a percentage between 0 and 25." };
  }
  const depositType = String(formData.get("defaultDepositType") ?? "percent") as DepositType;
  const depositRaw = String(formData.get("defaultDepositValue") ?? "0");
  const depositValue =
    depositType === "fixed"
      ? (parseAmountToCents(depositRaw) ?? 0)
      : Math.max(0, Math.min(100, Number(depositRaw) || 0));

  const db = getDb();
  await db
    .update(organizations)
    .set({
      name,
      licenseNumber: String(formData.get("licenseNumber") ?? "").trim() || null,
      insuranceLine: String(formData.get("insuranceLine") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      defaultMarkupPct: Math.round(markup),
      taxRateBp: Math.round(tax * 100),
      defaultDepositType: depositType,
      defaultDepositValue: depositValue,
      termsText: String(formData.get("termsText") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  await audit(org.id, user.id, "settings_updated", name);
  revalidatePath("/settings");
  return { saved: true };
}
