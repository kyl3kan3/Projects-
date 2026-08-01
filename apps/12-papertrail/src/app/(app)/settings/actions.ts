"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { brands, reminderRules } from "@/db/schema";
import { defaultBrand, requireUser } from "@/lib/auth";
import { plan } from "@/lib/plans";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import type { PlanId } from "@/db/schema";

export interface SettingsState {
  error?: string;
  message?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export async function saveBrandAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const limits = plan(user.plan);
  const brand = await defaultBrand(user.id);
  const db = getDb();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Your practice needs a name — it signs your documents." };

  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  if (logoUrl && !/^https:\/\/\S+$/.test(logoUrl)) {
    return { error: "A logo URL has to start with https://" };
  }

  const accentColor = String(formData.get("accentColor") ?? "").trim() || "#14213D";
  if (!HEX.test(accentColor)) return { error: "Give the accent colour as a hex value, like #14213D" };

  const senderDomainRaw = String(formData.get("senderDomain") ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (senderDomainRaw && !DOMAIN.test(senderDomainRaw)) {
    return { error: "That does not look like a domain — try studio.example" };
  }
  if (senderDomainRaw && !limits.senderDomain) {
    return { error: "A custom sender domain is a Solo feature." };
  }

  const branded = limits.customBranding;
  await db
    .update(brands)
    .set({
      name,
      logoUrl: branded ? logoUrl || null : brand.logoUrl,
      accentColor: branded ? accentColor : brand.accentColor,
      businessDetails: String(formData.get("businessDetails") ?? "").slice(0, 400),
      senderDomain: senderDomainRaw || null,
      // Verification is a DNS matter; changing the domain always resets it.
      senderDomainVerified:
        senderDomainRaw === brand.senderDomain ? brand.senderDomainVerified : false,
    })
    .where(and(eq(brands.id, brand.id), eq(brands.userId, user.id)));

  revalidatePath("/settings");
  return {
    message: branded
      ? "Brand saved."
      : "Saved. Logo and colours are a Solo feature — the name and details are on every plan.",
  };
}

export async function saveRemindersAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();
  const db = getDb();

  const step = (key: string, fallback: number) => {
    const value = Math.round(Number(formData.get(key) ?? fallback));
    return Number.isFinite(value) ? Math.min(120, Math.max(1, value)) : fallback;
  };
  const values = {
    enabled: formData.get("enabled") === "on",
    step1Days: step("step1Days", 1),
    step2Days: step("step2Days", 7),
    step3Days: step("step3Days", 14),
    ccOwnerOnFinal: formData.get("ccOwnerOnFinal") === "on",
    updatedAt: new Date(),
  };

  await db
    .insert(reminderRules)
    .values({ userId: user.id, ...values })
    .onConflictDoUpdate({ target: reminderRules.userId, set: values });

  revalidatePath("/settings");
  return {
    message: plan(user.plan).autoReminders
      ? "Reminder cadence saved."
      : "Saved. Automatic sending is a Solo feature — you can still send each notice by hand.",
  };
}

export async function startCheckoutAction(planId: PlanId): Promise<SettingsState> {
  const user = await requireUser();
  if (planId === "free") return { error: "Cancel from the billing portal instead." };
  let url: string;
  try {
    url = await createCheckoutSession(user, planId);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Stripe isn't set up here: ${err.message}`
          : "Could not start checkout",
    };
  }
  redirect(url);
}

export async function openPortalAction(): Promise<SettingsState> {
  const user = await requireUser();
  let url: string;
  try {
    url = await createPortalSession(user);
  } catch (err) {
    return {
      error:
        err instanceof Error ? `Stripe isn't set up here: ${err.message}` : "Could not open billing",
    };
  }
  redirect(url);
}
