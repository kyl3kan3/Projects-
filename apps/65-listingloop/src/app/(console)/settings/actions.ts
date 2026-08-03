"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { logAudit } from "@/lib/activity";
import { actorLabel, requireSession } from "@/lib/auth";
import { clearHolidayCache } from "@/lib/calendar";
import { isReadOnly } from "@/lib/plans";
import { runFanOut } from "@/lib/reminders";
import { readOffsets } from "@/lib/reminder-rules";

export interface SettingsState {
  error: string | null;
  ok?: string | null;
  /** Echoed back because React 19 resets the form after the action returns. */
  values?: Record<string, string>;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveSettingsAction(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { user, account } = await requireSession();
  if (isReadOnly(account)) return { error: "The desk is read-only until you choose a plan." };

  const name = text(form, "name");
  const typed = {
    name,
    state: text(form, "state"),
    timezone: text(form, "timezone"),
    reminderOffsets: text(form, "reminderOffsets"),
  };
  if (!name) return { error: "The desk needs a name.", values: typed };
  const state = text(form, "state").toUpperCase().slice(0, 2);
  if (!/^[A-Z]{2}$/.test(state)) return { error: "Pick a state.", values: typed };
  const timezone = text(form, "timezone");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  } catch {
    return { error: "That time zone is not one Node recognises.", values: typed };
  }

  const raw = text(form, "reminderOffsets");
  const parsed = raw
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((n) => Number(n));
  if (parsed.some((n) => !Number.isInteger(n) || n < 0 || n > 90)) {
    return {
      error: "Reminder offsets are whole numbers of days between 0 and 90, like 7, 3, 1.",
      values: typed,
    };
  }
  const offsets = [...new Set(parsed)].sort((a, b) => b - a);
  if (offsets.length === 0) return { error: "Keep at least one reminder offset.", values: typed };

  const settings = {
    ...(typeof account.settings === "object" && account.settings ? account.settings : {}),
    reminderOffsets: offsets,
    alwaysNotifyCoordinator: form.get("alwaysNotifyCoordinator") === "on",
  };

  await getDb()
    .update(accounts)
    .set({ name, state, timezone, settings, updatedAt: new Date() })
    .where(eq(accounts.id, account.id));
  // The state drives which holiday scope the engine loads.
  clearHolidayCache();

  await logAudit({
    accountId: account.id,
    actor: actorLabel(user),
    action: "settings_saved",
    target: name,
    metadata: { state, timezone, offsets },
  });
  revalidatePath("/settings");
  revalidatePath("/deals");
  return {
    error: null,
    ok: `Saved. Reminders fire at ${offsets.map((o) => `T-${o}`).join(", ")} for every date on the desk.`,
  };
}

/**
 * Run the fan-out now. This is the same code the nightly cron runs, and it is
 * here because a coordinator who has just fixed a party's email wants to know
 * the reminder went, not to wait until 1pm UTC tomorrow to find out.
 */
export async function runRemindersAction(_prev: SettingsState, _form: FormData): Promise<SettingsState> {
  const { account } = await requireSession();
  const summary = await runFanOut(account);
  const offsets = readOffsets(account.settings);
  if (summary.rungsClaimed === 0) {
    return {
      error: null,
      ok: `Nothing to send. Every date inside the ${offsets.map((o) => `T-${o}`).join("/")} windows has already had its reminder.`,
    };
  }
  const parts = [
    `${summary.rungsClaimed} ${summary.rungsClaimed === 1 ? "rung" : "rungs"} claimed`,
    `${summary.emailsSent} ${summary.emailsSent === 1 ? "email" : "emails"} ${summary.dryRun ? "prepared (DRY_RUN)" : "sent"}`,
  ];
  if (summary.emailsFailed > 0) parts.push(`${summary.emailsFailed} failed`);
  if (summary.unaddressed > 0) parts.push(`${summary.unaddressed} had nobody to tell`);
  revalidatePath("/deals");
  return { error: null, ok: `${parts.join(", ")}.` };
}
