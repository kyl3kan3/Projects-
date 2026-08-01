/**
 * Time, in the two shapes this product needs and no others.
 *
 * **Calendar dates** (`IsoDate`, `YYYY-MM-DD`) for registration windows, season
 * dates and installment due dates. Arithmetic runs through UTC midnight, so day
 * counts are exact and immune to daylight saving.
 *
 * **Instants** (`Date`) for anything on the schedule. A registrar types a wall
 * time — "Sat Sep 12, 9:00" — and that wall time means something only inside the
 * club's IANA zone. We convert it to an instant once, on write, and every
 * comparison afterwards is instant-to-instant. This is the whole reason the
 * conflict checker survives a DST boundary: on the Sunday the clocks go back,
 * 01:30 happens twice, and two games at "01:30" on two teams are a real overlap
 * only if their instants overlap. Comparing wall-clock strings would miss it, and
 * comparing naive UTC would invent conflicts that do not exist.
 *
 * The conversion uses `Intl.DateTimeFormat` with the zone, which carries the full
 * IANA rule set including historical and future DST transitions. No dependency
 * does this better; several do it worse.
 */

export type IsoDate = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/* -------------------------------------------------------- calendar dates --- */

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseIso(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Not an ISO date: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error(`Not a real calendar date: ${value}`);
  }
  return date;
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIso(now);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return toIso(new Date(parseIso(value).getTime() + days * DAY_MS));
}

export function addMonthsIso(value: IsoDate, months: number): IsoDate {
  const d = parseIso(value);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month1 = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDay);
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}-${String(
    day,
  ).padStart(2, "0")}`;
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** "Sep 12, 2026". */
export function formatIso(value: IsoDate | null | undefined): string {
  if (!value) return "—";
  const d = parseIso(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Sep 12". */
export function formatIsoShort(value: IsoDate): string {
  const d = parseIso(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/* ---------------------------------------------------------------- zones --- */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
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
      weekday: "short",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export interface WallParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** The wall-clock reading a person in `timeZone` sees at instant `at`. */
export function wallPartsInZone(at: Date, timeZone: string): WallParts {
  const parts = partsFormatter(timeZone).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

/**
 * The zone's UTC offset in milliseconds at instant `at`. Positive east of
 * Greenwich, so `instant + offset` reads as the local wall clock.
 */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  const p = wallPartsInZone(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop `at`'s own sub-second part: formatToParts truncates, and a stray
  // millisecond would otherwise show up as a 1ms offset error.
  return asUtc - (at.getTime() - (((at.getTime() % 1000) + 1000) % 1000));
}

/**
 * Turn a club-local wall time into the instant it names.
 *
 * Two passes, because the offset we need depends on the answer: guess with the
 * offset at the naive instant, then re-guess with the offset at that candidate.
 * The second pass is what makes a game booked at "01:30" on the fall-back Sunday
 * resolve to the *first* 01:30 rather than drifting an hour.
 *
 * Spring-forward gap times (02:30 on a day where 02:00–03:00 does not exist)
 * have no instant at all. Rather than throw at a registrar typing a plausible
 * time, we return the instant the clock reaches immediately after the gap and
 * `wallTimeExists` reports the discrepancy so a caller can warn.
 */
export function wallTimeToInstant(date: IsoDate, time: string, timeZone: string): Date {
  const { hour, minute } = parseClock(time);
  const d = parseIso(date);
  const naive = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    hour,
    minute,
    0,
    0,
  );
  const firstOffset = zoneOffsetMs(new Date(naive), timeZone);
  const firstGuess = naive - firstOffset;
  const secondOffset = zoneOffsetMs(new Date(firstGuess), timeZone);
  if (secondOffset === firstOffset) return new Date(firstGuess);
  const secondGuess = naive - secondOffset;
  // Prefer the candidate that actually reads back as the requested wall time.
  const reads = (ms: number) => {
    const p = wallPartsInZone(new Date(ms), timeZone);
    return p.hour === hour && p.minute === minute && p.day === d.getUTCDate();
  };
  if (reads(secondGuess)) return new Date(secondGuess);
  if (reads(firstGuess)) return new Date(firstGuess);
  // Nonexistent wall time (the spring-forward gap): land just after it.
  return new Date(Math.max(firstGuess, secondGuess));
}

/** True when `time` on `date` really exists in `timeZone` (false inside a DST gap). */
export function wallTimeExists(date: IsoDate, time: string, timeZone: string): boolean {
  const { hour, minute } = parseClock(time);
  const p = wallPartsInZone(wallTimeToInstant(date, time, timeZone), timeZone);
  return p.hour === hour && p.minute === minute;
}

/** "09:00" / "9:00" / "9:00 AM" / "21:30" → { hour, minute }. */
export function parseClock(time: string): { hour: number; minute: number } {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm]?)?\s*$/.exec(time);
  if (!m) throw new Error(`Not a time: ${time}`);
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const suffix = m[3]?.toLowerCase();
  if (suffix?.startsWith("p") && hour < 12) hour += 12;
  if (suffix?.startsWith("a") && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) throw new Error(`Not a time: ${time}`);
  return { hour, minute };
}

/** The club-local date + time of an instant, as the registrar would type it. */
export function instantToWall(at: Date, timeZone: string): { date: IsoDate; time: string } {
  const p = wallPartsInZone(at, timeZone);
  return {
    date: `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(
      p.day,
    ).padStart(2, "0")}`,
    time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
  };
}

/** "9:00A" / "12:30P" — the mono clock DESIGN.md specifies on schedule rows. */
export function formatClock(at: Date, timeZone: string): string {
  const p = wallPartsInZone(at, timeZone);
  const suffix = p.hour < 12 ? "A" : "P";
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12}:${String(p.minute).padStart(2, "0")}${suffix}`;
}

/** "SAT SEP 12" — the Label-style day header on the schedule. */
export function formatDayLabel(at: Date, timeZone: string): string {
  const p = wallPartsInZone(at, timeZone);
  return `${DAYS[p.weekday]} ${MONTHS[p.month - 1].toUpperCase()} ${p.day}`;
}

/** "Sat Sep 12 · 9:00A" for message bodies and receipts. */
export function formatWhen(at: Date, timeZone: string): string {
  const p = wallPartsInZone(at, timeZone);
  const day = DAYS[p.weekday].charAt(0) + DAYS[p.weekday].slice(1).toLowerCase();
  return `${day} ${MONTHS[p.month - 1]} ${p.day} · ${formatClock(at, timeZone)}`;
}

/** "6:42P" for read receipts. */
export function formatReceiptTime(at: Date, timeZone: string): string {
  return formatClock(at, timeZone);
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * MINUTE_MS);
}

/* ------------------------------------------------------------- intervals --- */

/**
 * Half-open interval overlap: `[aStart, aEnd)` against `[bStart, bEnd)`.
 *
 * Back-to-back is NOT a conflict — a 9:00–10:30 game followed by a 10:30–12:00
 * game on the same field is exactly how a club runs a Saturday, and a checker
 * that flags it gets switched off within a day. One minute of genuine overlap
 * IS a conflict. That asymmetry is the whole contract of this function.
 */
export function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Minutes of overlap between two intervals; 0 when they merely touch. */
export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, Math.round((end - start) / MINUTE_MS));
}

export { MONTHS, DAYS, DAY_MS };
