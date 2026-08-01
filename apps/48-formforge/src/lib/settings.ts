/**
 * src/lib/settings.ts
 *
 * Per-practice settings: the defaults, and the validation that keeps a practice
 * from configuring itself into a reminder loop. Pure — no database import — so the
 * ladder and its tests can read the defaults without pulling in `postgres`.
 */

import { z } from "zod";
import type { PracticeSettings } from "@/db/schema";

export const DEFAULT_SETTINGS: PracticeSettings = {
  timeZone: "America/New_York",
  quietStart: "21:00",
  quietEnd: "08:00",
  // +48h, +5d, +10d — fixed distances from the send, per ARCHITECTURE.md.
  reminderHours: [48, 120, 240],
  linkDays: 30,
  retentionYears: 7,
  notifyOnRiskFlag: true,
  hideScoresFromFrontDesk: true,
};

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

export const settingsSchema = z.object({
  timeZone: z.string().min(1).refine(isValidTimeZone, "That is not a recognised time zone"),
  quietStart: z.string().regex(timeRe, "Quiet hours use 24-hour HH:MM"),
  quietEnd: z.string().regex(timeRe, "Quiet hours use 24-hour HH:MM"),
  reminderHours: z
    .array(z.number().int().min(1).max(24 * 60))
    .max(5, "At most five reminders")
    .refine(
      (hours) => hours.every((h, i) => i === 0 || h - hours[i - 1] >= 24),
      "Leave at least 24 hours between reminders",
    ),
  linkDays: z.number().int().min(1).max(365),
  retentionYears: z.number().int().min(1).max(30),
  notifyOnRiskFlag: z.boolean(),
  hideScoresFromFrontDesk: z.boolean(),
});

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function parseSettings(input: unknown): PracticeSettings {
  return settingsSchema.parse(input);
}

/** Settings from the database, backfilled with defaults for older rows. */
export function settingsOf(practice: { settings: PracticeSettings | null }): PracticeSettings {
  return { ...DEFAULT_SETTINGS, ...(practice.settings ?? {}) };
}

