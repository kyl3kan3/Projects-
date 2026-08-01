"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isValidTimeZone } from "@/lib/tz";
import { createCheckoutSession, createPortalSession } from "@/lib/billing";
import { recomputeFindings } from "@/lib/findings";
import type { PlanId } from "@/db/schema";
import type { BillingInterval } from "@/lib/plans";

export interface SettingsFormState {
  error?: string;
  saved?: boolean;
}

export async function saveTimezoneAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const user = await requireUser();
  const timezone = String(formData.get("timezone") ?? "");
  if (!isValidTimeZone(timezone)) return { error: "That is not a timezone we recognise." };

  await getDb().update(users).set({ timezone }).where(eq(users.id, user.id));

  // Every time-of-day finding was computed on the old clock, so they are all
  // stale the moment this changes.
  await recomputeFindings({ ...user, timezone });

  revalidatePath("/settings");
  revalidatePath("/insights");
  revalidatePath("/dashboard");
  return { saved: true };
}

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const planId = String(formData.get("plan") ?? "") as PlanId;
  const interval = String(formData.get("interval") ?? "month") as BillingInterval;
  if (planId !== "trader" && planId !== "pro") return;
  const url = await createCheckoutSession(user, planId, interval === "year" ? "year" : "month");
  redirect(url);
}

export async function openPortalAction(): Promise<void> {
  const user = await requireUser();
  redirect(await createPortalSession(user));
}
