/**
 * src/lib/holidays.ts
 *
 * The holiday calendar the date engine reads, generated rather than typed out.
 *
 * US federal holidays follow 5 U.S.C. § 6103 with the standard weekend
 * observance rule: a holiday falling on Saturday is observed the Friday before,
 * one falling on Sunday the Monday after. Banks, county recorders and title
 * companies close on the *observed* day, which is the day a contract deadline
 * actually has to move around — so the observed date is what goes in the table.
 *
 * `scope` is "us" for federal, or a two-letter state code for the handful of
 * state days on which the recording office is shut. The engine loads the union
 * of "us" and the account's state.
 */

import { addDays, dayOfWeek, fromDayNumber, toDayNumber } from "@/lib/dates";

export interface HolidayRow {
  year: number;
  date: string;
  label: string;
  scope: string;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The nth given weekday of a month; n = -1 means the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = toDayNumber(iso(y, m, 1));
    const shift = (weekday - dayOfWeek(first) + 7) % 7;
    return fromDayNumber(first + shift + (n - 1) * 7);
  }
  const nextMonth = m === 12 ? toDayNumber(iso(y + 1, 1, 1)) : toDayNumber(iso(y, m + 1, 1));
  const last = nextMonth - 1;
  const back = (dayOfWeek(last) - weekday + 7) % 7;
  return fromDayNumber(last - back);
}

/** Saturday -> the Friday before; Sunday -> the Monday after. */
export function observedDate(fixed: string): string {
  const dow = dayOfWeek(toDayNumber(fixed));
  if (dow === 6) return addDays(fixed, -1);
  if (dow === 0) return addDays(fixed, 1);
  return fixed;
}

/** The eleven US federal holidays for one year, as observed. */
export function federalHolidays(year: number): HolidayRow[] {
  const fixed: Array<[string, string]> = [
    ["New Year's Day", iso(year, 1, 1)],
    ["Juneteenth", iso(year, 6, 19)],
    ["Independence Day", iso(year, 7, 4)],
    ["Veterans Day", iso(year, 11, 11)],
    ["Christmas Day", iso(year, 12, 25)],
  ];
  const floating: Array<[string, string]> = [
    ["Martin Luther King Jr. Day", nthWeekday(year, 1, 1, 3)],
    ["Presidents' Day", nthWeekday(year, 2, 1, 3)],
    ["Memorial Day", nthWeekday(year, 5, 1, -1)],
    ["Labor Day", nthWeekday(year, 9, 1, 1)],
    ["Columbus Day", nthWeekday(year, 10, 1, 2)],
    ["Thanksgiving Day", nthWeekday(year, 11, 4, 4)],
  ];

  const rows: HolidayRow[] = [];
  for (const [label, date] of fixed) {
    // `year` tracks the OBSERVED date, not the nominal one. New Year's Day 2028
    // falls on a Saturday and is observed Friday 2027-12-31 — the day the
    // recorder is actually shut — so that row belongs to 2027.
    const observed = observedDate(date);
    rows.push({ year: Number(observed.slice(0, 4)), date: observed, label, scope: "us" });
  }
  for (const [label, date] of floating) {
    // Floating holidays are always on a weekday already.
    rows.push({ year, date, label, scope: "us" });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * State days on which the county recorder is closed and a deadline therefore
 * moves. Deliberately short: only days that actually shut a recording office get
 * a row, because a wrong holiday moves a real deadline.
 */
const STATE_RULES: Record<string, Array<{ label: string; month: number; day: number }>> = {
  TX: [
    { label: "Texas Independence Day", month: 3, day: 2 },
    { label: "San Jacinto Day", month: 4, day: 21 },
  ],
  CO: [{ label: "Cesar Chavez Day", month: 3, day: 31 }],
  MA: [{ label: "Patriots' Day", month: 4, day: 0 }],
  IL: [{ label: "Lincoln's Birthday", month: 2, day: 12 }],
};

export function stateHolidays(year: number, state: string): HolidayRow[] {
  const code = state.toUpperCase();
  const rules = STATE_RULES[code];
  if (!rules) return [];
  return rules
    .map((r) =>
      r.day === 0
        ? // Patriots' Day: the third Monday in April.
          { year, date: nthWeekday(year, r.month, 1, 3), label: r.label, scope: code }
        : (() => {
            const observed = observedDate(iso(year, r.month, r.day));
            return {
              year: Number(observed.slice(0, 4)),
              date: observed,
              label: r.label,
              scope: code,
            };
          })(),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const STATES_WITH_RULES = Object.keys(STATE_RULES).sort();

/** Every row the seed loads: federal plus every state we have rules for. */
export function allHolidayRows(fromYear: number, toYear: number): HolidayRow[] {
  const rows: HolidayRow[] = [];
  for (let y = fromYear; y <= toYear; y += 1) {
    rows.push(...federalHolidays(y));
    for (const state of STATES_WITH_RULES) rows.push(...stateHolidays(y, state));
  }
  return rows;
}

/** Build the engine's lookup from rows already loaded from the table. */
export function toHolidayMap(rows: ReadonlyArray<{ date: string; label: string }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    // Federal wins the label when a state day collides; first write stays.
    if (!map.has(r.date)) map.set(r.date, r.label);
  }
  return map;
}
