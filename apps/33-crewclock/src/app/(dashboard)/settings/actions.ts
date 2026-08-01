"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, organizations, type Locale, type PayPeriod } from "@/db/schema";
import { requireOffice } from "@/lib/auth";
import { createBillingPortalSession, createCheckoutSession, billingConfigured } from "@/lib/stripe";
import type { Plan } from "@/db/schema";

const PERIODS: PayPeriod[] = ["weekly", "biweekly", "semimonthly"];

function clampInt(raw: string, fallback: number, min: number, max: number): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const timezone = String(formData.get("timezone") ?? org.timezone);
  const payPeriod = String(formData.get("payPeriod") ?? org.payPeriod) as PayPeriod;
  const defaultLocale = String(formData.get("defaultLocale") ?? "en") as Locale;

  // A timezone the runtime does not know would silently corrupt every week
  // boundary, so it is validated rather than trusted.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    redirect("/settings?error=timezone");
  }

  const db = getDb();
  await db
    .update(organizations)
    .set({
      name: String(formData.get("name") ?? org.name).trim() || org.name,
      timezone,
      weekStartsOn: clampInt(String(formData.get("weekStartsOn") ?? ""), org.weekStartsOn, 0, 6),
      payPeriod: PERIODS.includes(payPeriod) ? payPeriod : "weekly",
      otWeeklyThresholdHours: clampInt(
        String(formData.get("otWeeklyThresholdHours") ?? ""),
        40,
        1,
        168,
      ),
      maxShiftHours: clampInt(String(formData.get("maxShiftHours") ?? ""), 14, 1, 24),
      autoBreakMinutes: clampInt(String(formData.get("autoBreakMinutes") ?? ""), 0, 0, 240),
      autoBreakAfterHours: clampInt(String(formData.get("autoBreakAfterHours") ?? ""), 6, 0, 24),
      alertEmail: String(formData.get("alertEmail") ?? "").trim() || null,
      alertPhone: String(formData.get("alertPhone") ?? "").trim() || null,
      smsAlertsEnabled: formData.get("smsAlertsEnabled") === "on",
      adpCompanyCode: String(formData.get("adpCompanyCode") ?? "").trim() || null,
      defaultLocale: defaultLocale === "es" ? "es" : "en",
    })
    .where(eq(organizations.id, org.id));

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: user.id,
    action: "settings.update",
    target: org.id,
  });

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function checkoutAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  if (!billingConfigured()) redirect("/settings/billing?error=not_configured");
  const plan = (String(formData.get("plan") ?? "crew") === "company" ? "company" : "crew") as Plan;
  const url = await createCheckoutSession(org, user.email ?? "", plan);
  redirect(url);
}

export async function portalAction(): Promise<void> {
  const { user, org } = await requireOffice();
  if (!billingConfigured()) redirect("/settings/billing?error=not_configured");
  redirect(await createBillingPortalSession(org, user.email ?? ""));
}
