/**
 * Time and pay arithmetic. Pure functions, no I/O — this module is the reason
 * anyone trusts the product, so every rule in it is written down and tested.
 *
 * ## The rounding policy (the whole pitch, stated exactly)
 *
 * CrewClock's claim is "the timesheet that can't be rounded up". Concretely:
 *
 * 1. **Punch instants are never rounded.** No nearest-quarter-hour, no grace
 *    window, no "shift start" snapping. A punch at 07:20:41 is stored as
 *    07:20:41 and every downstream number derives from it.
 * 2. **Worked time is exact elapsed seconds** between clock-in and clock-out,
 *    minus unpaid break seconds. Elapsed, not wall-clock difference — which is
 *    why a shift spanning a DST change is paid for the hours actually worked
 *    (7 hours on spring-forward, 9 on fall-back for the same clock faces).
 * 3. **Payroll hours are truncated, never rounded up.** Payroll systems import
 *    hundredths of an hour (1 centihour = 36 seconds). We floor to the
 *    centihour, so an exported figure is always ≤ the true elapsed time. The
 *    residual is at most 35 seconds per shift and it always favours nobody: it
 *    is simply not claimed. Rounding *up* is the abuse the product exists to
 *    kill, so the code cannot do it — there is no rounding mode.
 * 4. **The UI shows exact minutes** alongside the truncated payroll figure, so
 *    a worker can always reconcile the two.
 *
 * ## Timezones
 *
 * Instants are UTC. Every *boundary* — a payroll day, a payroll week, a pay
 * period — is drawn in the job site's (or the org's) IANA zone, because a crew
 * that clocks out at 00:20 has worked Tuesday's hours, not Wednesday's.
 */

/* -------------------------------------------------------------- constants --- */

/** Payroll systems speak hundredths of an hour. 3600 / 100 = 36 seconds. */
export const SECONDS_PER_CENTIHOUR = 36;
export const SECONDS_PER_HOUR = 3600;

/* ------------------------------------------------------ duration & rounding --- */

export interface ShiftLike {
  clockInAt: Date;
  clockOutAt: Date | null;
  breakSeconds: number;
}

/**
 * Exact worked seconds. An open shift is measured against `now`, so the crew
 * screen's running readout and the payroll figure come from one function.
 * Negative results (a clock-out edited to before the clock-in) clamp to 0 —
 * the caller is expected to have refused the edit, but pay is never negative.
 */
export function workedSeconds(shift: ShiftLike, now: Date = new Date()): number {
  const end = shift.clockOutAt ?? now;
  const elapsed = Math.floor((end.getTime() - shift.clockInAt.getTime()) / 1000);
  return Math.max(0, elapsed - Math.max(0, shift.breakSeconds));
}

/**
 * The org's unpaid-meal auto-deduct. Applies only once the shift passes the
 * threshold, and only as a floor: a crew member who logged a longer break keeps
 * their own number (`effectiveBreakSeconds`).
 */
export function autoBreakSeconds(
  grossSeconds: number,
  org: { autoBreakMinutes: number; autoBreakAfterHours: number },
): number {
  if (org.autoBreakMinutes <= 0) return 0;
  if (grossSeconds <= org.autoBreakAfterHours * SECONDS_PER_HOUR) return 0;
  return org.autoBreakMinutes * 60;
}

/** The break we actually deduct: whichever is larger, logged or policy. */
export function effectiveBreakSeconds(
  grossSeconds: number,
  loggedBreakSeconds: number,
  org: { autoBreakMinutes: number; autoBreakAfterHours: number },
): number {
  return Math.max(Math.max(0, loggedBreakSeconds), autoBreakSeconds(grossSeconds, org));
}

/**
 * Seconds → hundredths of an hour, **truncated**. This is the only conversion
 * used for pay. There is deliberately no rounding option.
 */
export function toCentihours(seconds: number): number {
  return Math.floor(Math.max(0, seconds) / SECONDS_PER_CENTIHOUR);
}

/** Centihours → the decimal string payroll files carry: 799 → "7.99". */
export function centihoursToDecimal(centihours: number): string {
  const sign = centihours < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(centihours));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Centihours as a number, for arithmetic that has to look like hours. */
export function centihoursToHours(centihours: number): number {
  return centihours / 100;
}

/** Exact hours as a float — for projections and thresholds, never for pay. */
export function secondsToHours(seconds: number): number {
  return seconds / SECONDS_PER_HOUR;
}

/**
 * "7h 42m" — the readout. Minutes are truncated, matching the pay policy, so
 * the hero number never claims a minute that was not worked.
 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / SECONDS_PER_HOUR);
  const m = Math.floor((s % SECONDS_PER_HOUR) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Money: seconds at a cents-per-hour rate, rounded to the nearest cent. */
export function laborCostCents(seconds: number, rateCentsPerHour: number): number {
  return Math.round((Math.max(0, seconds) * rateCentsPerHour) / SECONDS_PER_HOUR);
}

/** 841000 → "$8,410". Integer cents in, display string out. */
export function formatMoneyCents(cents: number, opts: { cents?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const body = opts.cents
    ? `${dollars.toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`
    : dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${body}`;
}

/* ----------------------------------------------------------------- zones --- */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** What the wall clock in `timeZone` reads at this instant. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const bag: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(instant)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    // Intl can emit hour "24" for midnight in some engines; normalise it.
    hour: Number(bag.hour) % 24,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

/** The zone's UTC offset, in ms, at a given instant. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - instant.getTime();
}

/**
 * A wall-clock time in a zone → the UTC instant.
 *
 * Two passes, because the offset we need depends on the answer: guess with the
 * offset at the naive instant, then re-check with the offset at the candidate
 * (which differs on the two days a year that matter).
 *
 * Edge cases, deliberately chosen:
 *  - A time that does not exist (02:30 on spring-forward) resolves to the
 *    instant the clock jumped to. Nobody punches at a time that never happened;
 *    an office *editing* a punch to one gets the next real second.
 *  - An ambiguous time (01:30 on fall-back) resolves to the first occurrence,
 *    i.e. still in daylight time. The second occurrence is reachable by
 *    punching, because punches carry instants, not wall clocks.
 */
export function fromZonedWallTime(
  parts: Partial<ZonedParts> & { year: number; month: number; day: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  const firstOffset = zoneOffsetMs(new Date(naive), timeZone);
  const candidate = new Date(naive - firstOffset);
  const secondOffset = zoneOffsetMs(candidate, timeZone);
  if (secondOffset === firstOffset) return candidate;

  const corrected = new Date(naive - secondOffset);
  // Take the correction only if it actually renders as the wall time asked for.
  // Inside a spring-forward gap neither candidate does, and the first pass is
  // the one that lands *after* the jump rather than an hour before it.
  const p = zonedParts(corrected, timeZone);
  const rendered = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return rendered === naive ? corrected : candidate;
}

/* --------------------------------------------------------- date-key maths --- */

/** "YYYY-MM-DD" in the given zone. The key every payroll boundary uses. */
export function localDateKey(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Not a date key: ${key}`);
  return { year: y, month: m, day: d };
}

/** Date-key arithmetic, done in UTC where days are always 24h long. */
export function addDaysToDateKey(key: string, days: number): string {
  const { year, month, day } = parseDateKey(key);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

export function daysBetweenDateKeys(from: string, to: string): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/** 0 = Sunday … 6 = Saturday, for a date key. */
export function dayOfWeekForKey(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** The UTC instant at which a local day begins. */
export function startOfLocalDay(key: string, timeZone: string): Date {
  return fromZonedWallTime({ ...parseDateKey(key), hour: 0, minute: 0, second: 0 }, timeZone);
}

/** Half-open range [start, end) covering the local days from…to inclusive. */
export function localRangeUtc(
  fromKey: string,
  toKey: string,
  timeZone: string,
): { start: Date; end: Date } {
  return {
    start: startOfLocalDay(fromKey, timeZone),
    end: startOfLocalDay(addDaysToDateKey(toKey, 1), timeZone),
  };
}

/* --------------------------------------------------------- payroll weeks --- */

/** The date key of the payroll week containing `instant`. */
export function weekStartKey(instant: Date, timeZone: string, weekStartsOn: number): string {
  const key = localDateKey(instant, timeZone);
  return weekStartKeyForDate(key, weekStartsOn);
}

export function weekStartKeyForDate(key: string, weekStartsOn: number): string {
  const dow = dayOfWeekForKey(key);
  const back = (dow - weekStartsOn + 7) % 7;
  return addDaysToDateKey(key, -back);
}

/** The seven date keys of a payroll week, in order. */
export function weekDateKeys(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateKey(weekStart, i));
}

/**
 * The pay period containing a date, per the org's schedule.
 *  - weekly: the payroll week.
 *  - biweekly: two payroll weeks, anchored so that week parity is stable
 *    against a fixed epoch (1970-01-04 was a Sunday).
 *  - semimonthly: 1st-15th and 16th-end of month.
 */
export function payPeriodFor(
  key: string,
  opts: { payPeriod: "weekly" | "biweekly" | "semimonthly"; weekStartsOn: number },
): { start: string; end: string } {
  if (opts.payPeriod === "semimonthly") {
    const { year, month, day } = parseDateKey(key);
    const pad = (n: number) => String(n).padStart(2, "0");
    if (day <= 15) return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-15` };
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { start: `${year}-${pad(month)}-16`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
  }

  const weekStart = weekStartKeyForDate(key, opts.weekStartsOn);
  if (opts.payPeriod === "weekly") {
    return { start: weekStart, end: addDaysToDateKey(weekStart, 6) };
  }

  // Biweekly: anchor parity on a fixed epoch so the boundary never drifts.
  const epoch = weekStartKeyForDate("1970-01-04", opts.weekStartsOn);
  const weeks = Math.floor(daysBetweenDateKeys(epoch, weekStart) / 7);
  const start = weeks % 2 === 0 ? weekStart : addDaysToDateKey(weekStart, -7);
  return { start, end: addDaysToDateKey(start, 13) };
}
