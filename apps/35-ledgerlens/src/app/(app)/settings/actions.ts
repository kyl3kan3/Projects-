"use server";

/**
 * Settings actions: the two things an operator changes (their business details and
 * their digest cadence) plus signing out. Nothing else is exported, because a
 * `"use server"` export nobody calls is an endpoint nobody guards.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { organizations } from "@/db/schema";
import { clearSession, requireUser } from "@/lib/auth";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { TIME_ZONE_IDS } from "@/lib/timezones";

export interface SettingsFormState {
  error: string | null;
  saved: boolean;
}

export async function saveSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { org } = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const timeZone = String(formData.get("timeZone") ?? "");
  const digestWeekday = Number(formData.get("digestWeekday") ?? 1);
  const weeklyDigestEnabled = String(formData.get("weeklyDigestEnabled") ?? "") === "on";

  try {
    if (name.length < 2) throw new ValidationError("Use at least two characters for the name.");
    if (!TIME_ZONE_IDS.includes(timeZone)) throw new ValidationError("Pick a timezone from the list.");
    if (!Number.isInteger(digestWeekday) || digestWeekday < 0 || digestWeekday > 6) {
      throw new ValidationError("Pick a weekday from the list.");
    }
    await getDb()
      .update(organizations)
      .set({ name, timeZone, digestWeekday, weeklyDigestEnabled, updatedAt: new Date() })
      .where(eq(organizations.id, org.id));
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Those settings could not be saved."), saved: false };
  }
  revalidatePath("/settings");
  return { error: null, saved: true };
}

export async function signOutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
