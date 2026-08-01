"use server";

/**
 * Settings actions: quiet hours and retention, the data-protection agreement, and
 * signing out. Three endpoints, all called from forms in this route group.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actorFor, clearSession, requireRole, requireUser } from "@/lib/auth";
import { parseSettings, updateSettings } from "@/lib/practices";
import { acceptAgreement, AgreementError } from "@/lib/agreement";
import { appendAuditEvent } from "@/lib/audit";
import { clientIp } from "@/lib/request";

export interface SettingsState {
  error: string | null;
  saved: boolean;
  /**
   * What was submitted. React 19 resets an uncontrolled form once its action
   * resolves, so a rejected save would silently revert every field to the stored
   * value — the form re-renders from these instead.
   */
  values?: Record<string, string>;
}

export async function saveSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  // Only an owner changes retention: it decides when records are destroyed.
  const { user, practice } = await requireRole(["owner"]);

  const submitted: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") submitted[key] = value;
  }

  const reminderHours = String(formData.get("reminderHours") ?? "")
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n));

  try {
    const settings = parseSettings({
      timeZone: String(formData.get("timeZone") ?? ""),
      quietStart: String(formData.get("quietStart") ?? ""),
      quietEnd: String(formData.get("quietEnd") ?? ""),
      reminderHours,
      linkDays: Number.parseInt(String(formData.get("linkDays") ?? "30"), 10),
      retentionYears: Number.parseInt(String(formData.get("retentionYears") ?? "7"), 10),
      notifyOnRiskFlag: formData.get("notifyOnRiskFlag") === "on",
      hideScoresFromFrontDesk: formData.get("hideScoresFromFrontDesk") === "on",
    });
    await updateSettings(practice.id, settings);
    await appendAuditEvent({
      practiceId: practice.id,
      actorType: "user",
      actorId: user.id,
      actorLabel: actorFor(user).label,
      action: "edited",
      targetType: "practice",
      targetId: practice.id,
      targetLabel: "settings",
      ip: await clientIp(),
      metadata: { count: reminderHours.length, reason: `retention ${settings.retentionYears}y` },
    });
  } catch (err) {
    const message =
      err && typeof err === "object" && "issues" in err
        ? String((err as { issues: { message: string }[] }).issues[0]?.message ?? "Invalid settings")
        : "Could not save those settings";
    return { error: message, saved: false, values: submitted };
  }

  revalidatePath("/settings");
  return { error: null, saved: true };
}

export interface AgreementFormState {
  error: string | null;
}

export async function acceptAgreementAction(
  _prev: AgreementFormState,
  formData: FormData,
): Promise<AgreementFormState> {
  const { user, practice } = await requireUser();
  try {
    await acceptAgreement(
      practice.id,
      String(formData.get("signerName") ?? ""),
      actorFor(user, await clientIp()),
    );
  } catch (err) {
    if (err instanceof AgreementError) return { error: err.message };
    console.error("[agreement] failed", err);
    return { error: "Could not record that. Try again." };
  }
  revalidatePath("/settings");
  redirect("/intakes");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
