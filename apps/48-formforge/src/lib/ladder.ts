/**
 * src/lib/ladder.ts
 *
 * Reminder-ladder arithmetic. Pure: no database, no providers, no clock of its
 * own — every function takes the times it needs. `lib/reminders.ts` is the ledger
 * that persists what this module decides.
 *
 * Two failure modes are designed out here rather than tested for downstream:
 *
 *  - **The reminder that never stops.** "Not completed yet" stays true forever, so
 *    any sweep that mails on that condition mails the same patient every morning
 *    until the heat death of the universe. This function returns a finite list of
 *    absolute times pinned to fixed distances from the send, and there is no rung
 *    after the last one.
 *
 *  - **The ladder that goes quiet.** Selecting the loosest crossed threshold means
 *    a +48h notice fires and nothing else ever does. There is no threshold
 *    selection at all: every rung is its own row with its own time.
 */

import type { PracticeSettings } from "@/db/schema";
import { zoned } from "@/lib/format";

export type ReminderChannelName = "email" | "sms";

export interface ReminderPlan {
  channel: ReminderChannelName;
  /** Rung index in the ladder — half of the (intake, channel, step) dedupe key. */
  step: number;
  scheduledFor: Date;
}

function parseHhMm(value: string): number {
  const [h, m] = value.split(":").map((n) => Number.parseInt(n, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function minutesOfDay(at: Date, timeZone: string): number {
  const p = zoned(at, timeZone);
  return p.hour * 60 + p.minute;
}

/** Is a wall-clock minute inside the quiet window? Handles the overnight wrap. */
export function isQuiet(minute: number, quietStart: string, quietEnd: string): boolean {
  const start = parseHhMm(quietStart);
  const end = parseHhMm(quietEnd);
  if (start === end) return false;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/**
 * Shift a timestamp out of quiet hours, to the practice-local end of the window.
 *
 * Iterates because adding wall-clock minutes to a UTC instant can land somewhere
 * unexpected across a DST boundary; a second pass always converges, and the loop
 * is bounded either way.
 */
export function shiftOutOfQuietHours(
  at: Date,
  settings: Pick<PracticeSettings, "timeZone" | "quietStart" | "quietEnd">,
): Date {
  let candidate = at;
  for (let pass = 0; pass < 4; pass += 1) {
    const minute = minutesOfDay(candidate, settings.timeZone);
    if (!isQuiet(minute, settings.quietStart, settings.quietEnd)) return candidate;
    const end = parseHhMm(settings.quietEnd);
    const delta = (end - minute + 1440) % 1440 || 1440;
    candidate = new Date(candidate.getTime() + delta * 60_000);
  }
  return candidate;
}

/**
 * The ladder for one intake: absolute timestamps, already shifted out of quiet
 * hours, and never past the link's own expiry — a reminder pointing at a dead
 * link is worse than no reminder.
 */
export function planReminders(input: {
  sentAt: Date;
  expiresAt: Date;
  settings: Pick<PracticeSettings, "timeZone" | "quietStart" | "quietEnd" | "reminderHours">;
  email: boolean;
  sms: boolean;
}): ReminderPlan[] {
  const hours = input.settings.reminderHours;
  // SMS rides the second rung: by then email alone has not worked, and one text
  // is a nudge where three is a nuisance.
  const smsRung = hours.length >= 2 ? 1 : 0;
  const plans: ReminderPlan[] = [];

  hours.forEach((h, step) => {
    const at = shiftOutOfQuietHours(new Date(input.sentAt.getTime() + h * 3_600_000), input.settings);
    if (at.getTime() >= input.expiresAt.getTime()) return;
    if (input.email) plans.push({ channel: "email", step, scheduledFor: at });
    if (input.sms && step === smsRung) plans.push({ channel: "sms", step, scheduledFor: at });
  });

  return plans;
}
