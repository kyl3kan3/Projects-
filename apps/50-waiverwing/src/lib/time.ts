/**
 * Calendar maths in a named timezone, with no timezone dependency.
 *
 * Two different kinds of time run through WaiverWing and mixing them up is how
 * you get a waiver that expires a day early in Denver:
 *
 *  - **Instants** — when a signature happened. Stored as timestamptz.
 *  - **Calendar dates** — a date of birth, and "today" at a venue. These have
 *    no time and belong to a place. A "valid for this visit" waiver expires at
 *    the end of the venue's day, not 24 hours after signing.
 *
 * Intl gives us everything needed for that without pulling in a tz library.
 */

const PARTS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = PARTS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PARTS.set(timeZone, f);
  }
  return f;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localParts(at: Date, timeZone: string): LocalParts {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/** Offset of `timeZone` from UTC at instant `at`, in milliseconds. */
function offsetMs(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * The instant at which local wall-clock midnight of the given calendar date
 * occurs in `timeZone`. Two refinement passes settle DST transitions.
 */
export function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    guess = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs(new Date(guess), timeZone);
  }
  return new Date(guess);
}

/** "2026-03-02" for the venue's current day. */
export function localDateString(at: Date, timeZone: string): string {
  const p = localParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Start of the venue's day containing `at`. */
export function startOfLocalDay(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  return zonedMidnight(p.year, p.month, p.day, timeZone);
}

/** The instant the venue's day containing `at` ends (exclusive upper bound). */
export function endOfLocalDay(at: Date, timeZone: string): Date {
  const start = startOfLocalDay(at, timeZone);
  // +26h then snap back to that day's midnight: survives both DST directions.
  const nextish = new Date(start.getTime() + 26 * 3600_000);
  return startOfLocalDay(nextish, timeZone);
}

/** Parse an ISO yyyy-mm-dd calendar date. Returns null for anything else. */
export function parseCalendarDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject 2026-02-30 and friends.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * Whole years elapsed between a calendar date of birth and an instant, as read
 * in `timeZone`. Birthday-aware: turning 18 happens on the birthday, not 365 ×
 * 18 days after birth.
 */
export function ageOn(dobIso: string, at: Date, timeZone = "UTC"): number | null {
  const dob = parseCalendarDate(dobIso);
  if (!dob) return null;
  const now = localParts(at, timeZone);
  let age = now.year - dob.year;
  if (now.month < dob.month || (now.month === dob.month && now.day < dob.day)) age -= 1;
  return age;
}

/**
 * The instant a person born on `dobIso` reaches `age`, in `timeZone`.
 *
 * Feb 29 births: the birthday is taken as Mar 1 in non-leap years, which is the
 * later of the two conventions — it never treats someone as an adult a day
 * before they could be.
 */
export function birthdayInstant(dobIso: string, age: number, timeZone = "UTC"): Date | null {
  const dob = parseCalendarDate(dobIso);
  if (!dob) return null;
  const year = dob.year + age;
  let month = dob.month;
  let day = dob.day;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1) {
    month = 3;
    day = 1;
  }
  return zonedMidnight(year, month, day, timeZone);
}

export function addDays(at: Date, days: number): Date {
  return new Date(at.getTime() + days * 86_400_000);
}
