/**
 * Daypart resolution: which of a location's menus is the one a guest should see
 * right now.
 *
 * A daypart is `{ days?: number[], start: "HH:MM", end: "HH:MM" }` in the
 * location's own timezone. `end <= start` means the window crosses midnight
 * (a bar's 21:00–02:00), and a window that crosses midnight belongs to the day
 * it *started* — so at 00:30 on Saturday, Friday's late menu is still live.
 *
 * Pure module. No database, no clock of its own: the caller passes `now`.
 */

import type { Daypart } from "@/db/schema";
import { minutesOfDay, zonedParts } from "@/lib/time";

export interface DaypartWindow {
  startMinutes: number;
  endMinutes: number;
  /** True when the window runs past local midnight. */
  crossesMidnight: boolean;
  days: number[] | null;
}

/** `"17:30"` -> 1050. Returns null for anything that isn't HH:MM. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** 1050 -> `"5:30pm"`, for chips and labels. */
export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function parseDaypart(daypart: Daypart | null | undefined): DaypartWindow | null {
  if (!daypart) return null;
  const startMinutes = parseClock(daypart.start ?? "");
  const endMinutes = parseClock(daypart.end ?? "");
  if (startMinutes === null || endMinutes === null) return null;
  const days =
    Array.isArray(daypart.days) && daypart.days.length
      ? daypart.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : null;
  return {
    startMinutes,
    endMinutes,
    crossesMidnight: endMinutes <= startMinutes,
    days: days && days.length ? days : null,
  };
}

/**
 * Is the window open at `now`?
 *
 * Boundaries are explicit: the window is open at `start` and closed at `end`
 * (`[start, end)`), so a 17:00–22:00 dinner is live at 17:00 and dark at 22:00.
 */
export function isDaypartActive(
  daypart: Daypart | null | undefined,
  now: Date,
  timeZone: string,
): boolean {
  const window = parseDaypart(daypart);
  if (!window) return true; // no window at all = always available

  const minutes = minutesOfDay(now, timeZone);
  const weekday = zonedParts(now, timeZone).weekday;

  if (!window.crossesMidnight) {
    if (window.days && !window.days.includes(weekday)) return false;
    return minutes >= window.startMinutes && minutes < window.endMinutes;
  }

  // Crossing midnight: either we're in the evening leg of today's window, or in
  // the early-hours leg of the window that started yesterday.
  const eveningLeg = minutes >= window.startMinutes;
  const morningLeg = minutes < window.endMinutes;
  if (!eveningLeg && !morningLeg) return false;
  if (!window.days) return true;
  const startedOn = eveningLeg ? weekday : (weekday + 6) % 7;
  return window.days.includes(startedOn);
}

/** Human label for a chip: `"Dinner · 5pm–10pm"` or just the name. */
export function daypartLabel(daypart: Daypart | null | undefined): string | null {
  const window = parseDaypart(daypart);
  if (!window) return null;
  return `${formatClock(window.startMinutes)}–${formatClock(window.endMinutes)}`;
}

export interface DaypartCandidate {
  id: string;
  name: string;
  daypart: Daypart | null;
  position: number;
}

/**
 * Pick the menu a guest lands on. Preference order:
 *   1. a live menu whose daypart is open right now, tightest window first —
 *      "Happy hour 4–6" should beat "All day" when both are open;
 *   2. otherwise the first always-available menu;
 *   3. otherwise the lowest-positioned menu, so the QR never shows nothing.
 */
export function resolveActiveMenu<T extends DaypartCandidate>(
  menus: T[],
  now: Date,
  timeZone: string,
): T | null {
  if (!menus.length) return null;
  const open = menus.filter((m) => isDaypartActive(m.daypart, now, timeZone));
  if (!open.length) return [...menus].sort((a, b) => a.position - b.position)[0] ?? null;

  const width = (m: T): number => {
    const w = parseDaypart(m.daypart);
    if (!w) return 24 * 60 + 1; // always-available is the widest possible window
    const span = w.crossesMidnight
      ? 24 * 60 - w.startMinutes + w.endMinutes
      : w.endMinutes - w.startMinutes;
    return span;
  };

  return [...open].sort((a, b) => width(a) - width(b) || a.position - b.position)[0] ?? null;
}
