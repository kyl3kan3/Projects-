"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations, type Trade } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { parseAmountToCents } from "@/lib/money";
import { seedStarterTemplate } from "@/lib/price-book";
import { TRADE_ORDER } from "@/lib/trades";

export interface OnboardingState {
  error?: string;
}

/**
 * Finish onboarding: trade, branding, license, estimate defaults, and the
 * starter price book for the trade.
 *
 * Seeding the starter book here rather than offering it later is deliberate — an
 * org with an empty price book cannot draft anything, and the first walkthrough
 * happens before anyone has imported a rate sheet.
 */
export async function completeOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const { org, user } = await requireUser();
  const trade = String(formData.get("trade") ?? "hvac") as Trade;
  if (!TRADE_ORDER.includes(trade)) return { error: "Pick a trade." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Your company name goes on every proposal — add it." };

  const markupRaw = Number(String(formData.get("defaultMarkupPct") ?? "35"));
  if (!Number.isFinite(markupRaw) || markupRaw < 0 || markupRaw > 400) {
    return { error: "Markup should be a percentage between 0 and 400." };
  }
  const taxRaw = Number(String(formData.get("taxRatePct") ?? "0"));
  if (!Number.isFinite(taxRaw) || taxRaw < 0 || taxRaw > 25) {
    return { error: "Sales tax should be a percentage between 0 and 25." };
  }
  const depositType = String(formData.get("depositType") ?? "percent") as
    | "none"
    | "percent"
    | "fixed";
  const depositRaw = String(formData.get("depositValue") ?? "10");
  const depositValue =
    depositType === "fixed"
      ? (parseAmountToCents(depositRaw) ?? 0)
      : Math.max(0, Math.min(100, Number(depositRaw) || 0));

  const db = getDb();
  const seeded = String(formData.get("seedPriceBook") ?? "on") === "on";
  await db
    .update(organizations)
    .set({
      name,
      trade,
      licenseNumber: String(formData.get("licenseNumber") ?? "").trim() || null,
      insuranceLine: String(formData.get("insuranceLine") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      brandColor: String(formData.get("brandColor") ?? "#CD7A29"),
      defaultMarkupPct: Math.round(markupRaw),
      taxRateBp: Math.round(taxRaw * 100),
      defaultDepositType: depositType,
      defaultDepositValue: depositValue,
      onboardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));

  if (seeded) await seedStarterTemplate(org.id, trade);
  await audit(org.id, user.id, "org_onboarded", name, { trade, seeded });

  redirect("/jobs");
}
