/**
 * src/lib/availability.ts
 *
 * Real availability, as pure functions: working hours minus what is already booked,
 * stepped to the service's duration, in the stylist's own timezone.
 *
 * Availability honesty is a product law — a slot shown is a slot bookable — so the
 * same function that renders the picker is the one the booking transaction re-checks
 * against. There is no second, looser implementation anywhere.
 */

import { dayTimeToUtc, parseHhMm, weekdayOfDay } from "@/lib/dates";

export interface DayHours {
  /** "09:00" — wall clock where the chair is. */
  open: string;
  close: string;
  off: boolean;
}

/** Keyed "0".."6", Sunday first, matching `Date.getUTCDay()`. */
export type WorkingHours = Record<string, DayHours>;

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** A barber's week: closed Sunday and Monday, on the chair Tuesday to Saturday. */
export const DEFAULT_WORKING_HOURS: WorkingHours = {
  "0": { open: "10:00", close: "16:00", off: true },
  "1": { open: "10:00", close: "18:00", off: true },
  "2": { open: "10:00", close: "19:00", off: false },
  "3": { open: "10:00", close: "19:00", off: false },
  "4": { open: "10:00", close: "20:00", off: false },
  "5": { open: "09:00", close: "19:00", off: false },
  "6": { open: "09:00", close: "16:00", off: false },
};

export function parseWorkingHours(raw: unknown): WorkingHours {
  const out: WorkingHours = { ...DEFAULT_WORKING_HOURS };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(key) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const open = typeof v.open === "string" ? v.open : out[key].open;
    const close = typeof v.close === "string" ? v.close : out[key].close;
    out[key] = { open, close, off: Boolean(v.off) };
  }
  return out;
}

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

/** Half-open overlap: an appointment ending at 2:00 does not collide with 2:00. */
export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

export interface SlotOptions {
  timezone: string;
  /** "2026-08-06" — a calendar day where the chair is. */
  day: string;
  hours: WorkingHours;
  durationMinutes: number;
  /** Booked appointments and any other busy blocks, as instants. */
  busy: Interval[];
  /** How far ahead a client must book. Defaults to two hours. */
  minNoticeMinutes?: number;
  /** Slot granularity. DESIGN.md's picker is a 15-minute grid. */
  stepMinutes?: number;
  now: Date;
}

/**
 * The bookable starts on one day.
 *
 * Ends are computed from the start plus the duration rather than from the grid, so a
 * 45-minute service on a 15-minute grid can start at 10:15 and finish at 11:00 — the
 * grid is where a client may *start*, not a set of fixed boxes.
 */
export function slotsForDay(options: SlotOptions): Interval[] {
  const {
    timezone,
    day,
    hours,
    durationMinutes,
    busy,
    now,
    minNoticeMinutes = 120,
    stepMinutes = 15,
  } = options;

  if (durationMinutes <= 0) return [];
  const weekday = String(weekdayOfDay(day));
  const dayHours = hours[weekday];
  if (!dayHours || dayHours.off) return [];

  const [openH, openM] = parseHhMm(dayHours.open);
  const [closeH, closeM] = parseHhMm(dayHours.close);
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;
  if (closeMinutes <= openMinutes) return [];

  const earliest = now.getTime() + minNoticeMinutes * 60_000;
  const slots: Interval[] = [];

  for (let m = openMinutes; m + durationMinutes <= closeMinutes; m += stepMinutes) {
    const startsAt = dayTimeToUtc(
      timezone,
      day,
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`,
    );
    if (startsAt.getTime() < earliest) continue;
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
    const candidate = { startsAt, endsAt };
    if (busy.some((b) => overlaps(candidate, b))) continue;
    slots.push(candidate);
  }
  return slots;
}

/** The bookable starts across a run of days, in order. */
export function slotsForDays(
  days: string[],
  options: Omit<SlotOptions, "day">,
): Array<{ day: string; slots: Interval[] }> {
  return days.map((day) => ({ day, slots: slotsForDay({ ...options, day }) }));
}

export type PartOfDay = "morning" | "afternoon" | "evening";

/** Which third of the day a wall-clock hour falls in — the waitlist's preference. */
export function partOfDay(hour: number): PartOfDay {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export interface DayPreference {
  /** 0-6, Sunday first. Empty means any day. */
  weekdays: number[];
  partOfDay?: PartOfDay;
}

export function parseDayPreference(raw: unknown): DayPreference {
  if (!raw || typeof raw !== "object") return { weekdays: [] };
  const r = raw as Record<string, unknown>;
  const weekdays = Array.isArray(r.weekdays)
    ? r.weekdays.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
    : [];
  const part = r.partOfDay;
  return {
    weekdays,
    partOfDay:
      part === "morning" || part === "afternoon" || part === "evening" ? part : undefined,
  };
}

/** Does a freed slot match what a waitlisted client said they wanted? */
export function preferenceMatches(
  preference: DayPreference,
  slot: { weekday: number; hour: number },
): boolean {
  if (preference.weekdays.length > 0 && !preference.weekdays.includes(slot.weekday)) {
    return false;
  }
  if (preference.partOfDay && partOfDay(slot.hour) !== preference.partOfDay) return false;
  return true;
}
