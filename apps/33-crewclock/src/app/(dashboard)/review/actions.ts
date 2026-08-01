"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOffice } from "@/lib/auth";
import { fromZonedWallTime } from "@/lib/time";
import {
  EntryEditError,
  approvePeriod,
  editEntry,
  reopenPeriod,
} from "@/lib/time-entries";

/**
 * A datetime-local field gives "2026-02-24T07:03" with no zone. It means that
 * wall-clock time in the org's timezone — which is exactly what the office
 * typed, and not what `new Date()` would parse it as on a server in UTC.
 */
function parseLocalDateTime(raw: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return fromZonedWallTime(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: 0,
    },
    timeZone,
  );
}

export async function editEntryAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const entryId = String(formData.get("entryId") ?? "");
  const period = String(formData.get("period") ?? "");
  const back = period ? `/review?period=${period}` : "/review";
  if (!entryId) redirect(back);

  const clockInRaw = String(formData.get("clockInAt") ?? "");
  const clockOutRaw = String(formData.get("clockOutAt") ?? "");
  const breakMinutesRaw = String(formData.get("breakMinutes") ?? "");
  const reason = String(formData.get("reason") ?? "");

  const clockInAt = parseLocalDateTime(clockInRaw, org.timezone);
  const clockOutAt = clockOutRaw.trim() ? parseLocalDateTime(clockOutRaw, org.timezone) : null;
  const breakMinutes = Number(breakMinutesRaw);

  try {
    await editEntry(
      entryId,
      {
        ...(clockInAt ? { clockInAt } : {}),
        ...(clockOutRaw.trim() ? { clockOutAt: clockOutAt ?? undefined } : {}),
        ...(Number.isFinite(breakMinutes) && breakMinutesRaw.trim()
          ? { breakSeconds: Math.max(0, Math.round(breakMinutes * 60)) }
          : {}),
        ...(String(formData.get("jobId") ?? "").trim()
          ? { jobId: String(formData.get("jobId")) }
          : {}),
      },
      user,
      reason,
    );
  } catch (err) {
    if (err instanceof EntryEditError) {
      redirect(`${back}${back.includes("?") ? "&" : "?"}error=${err.message}&entry=${entryId}`);
    }
    throw err;
  }

  revalidatePath("/review");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`);
}

/** Close a shift someone forgot to end. It is an edit, so it needs a reason. */
export async function closeShiftAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const entryId = String(formData.get("entryId") ?? "");
  const period = String(formData.get("period") ?? "");
  const back = period ? `/review?period=${period}` : "/review";
  const clockOutAt = parseLocalDateTime(String(formData.get("clockOutAt") ?? ""), org.timezone);
  if (!entryId || !clockOutAt) redirect(back);

  try {
    await editEntry(
      entryId,
      { clockOutAt },
      user,
      String(formData.get("reason") ?? "") || "Missed clock-out closed by office",
    );
  } catch (err) {
    if (err instanceof EntryEditError) {
      redirect(`${back}${back.includes("?") ? "&" : "?"}error=${err.message}&entry=${entryId}`);
    }
    throw err;
  }
  revalidatePath("/review");
  redirect(back);
}

export async function approvePeriodAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  if (!periodStart || !periodEnd) redirect("/review");
  await approvePeriod(org, periodStart, periodEnd, user);
  revalidatePath("/review");
  revalidatePath("/export");
  redirect(`/review?period=${periodStart}&approved=1`);
}

export async function reopenPeriodAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOffice();
  const periodStart = String(formData.get("periodStart") ?? "");
  const periodEnd = String(formData.get("periodEnd") ?? "");
  if (!periodStart || !periodEnd) redirect("/review");
  await reopenPeriod(org, periodStart, periodEnd, user);
  revalidatePath("/review");
  redirect(`/review?period=${periodStart}`);
}
