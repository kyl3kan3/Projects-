/**
 * Timezone arithmetic without a timezone library.
 *
 * A restaurant's "tonight" is a local concept: a 1:15am 86 belongs to the night
 * that started the evening before, and nightly auto-restore must fire at 4am
 * *there*, not 4am UTC. `Intl.DateTimeFormat` already carries the full tz
 * database, so everything here is built on it — no dependency, no drift.
 *
 * Pure module: safe to import from client components and from tests.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0 = Sunday. */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Wall-clock parts of `at` as seen in `timeZone`. */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  // Intl renders midnight as hour 24 in some ICU versions under hour12:false.
  const hour = Number(bag.hour) % 24;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
    weekday: Math.max(0, WEEKDAYS.indexOf(bag.weekday ?? "Sun")),
  };
}

/** Minutes since local midnight — the number daypart windows compare against. */
export function minutesOfDay(at: Date, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  return p.hour * 60 + p.minute;
}

/**
 * The UTC instant of a given local wall-clock time.
 *
 * Solved by iteration rather than by offset table: guess UTC as if the zone
 * were UTC, measure how far off the guess renders, correct, repeat. Two passes
 * converge everywhere including DST boundaries; a third is belt and braces.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const rendered = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    const drift = target - rendered;
    if (drift === 0) break;
    guess += drift;
  }
  return new Date(guess);
}

/**
 * Start of the current **service day**: the most recent local `rolloverHour`.
 *
 * At 1:15am with a 4am rollover, the service day started at 4am *yesterday* —
 * which is why the 86 board still says "tonight" to the closing crew.
 */
export function serviceDayStart(now: Date, timeZone: string, rolloverHour: number): Date {
  const p = zonedParts(now, timeZone);
  const rollover = Math.min(23, Math.max(0, Math.trunc(rolloverHour)));
  let { year, month, day } = p;
  if (p.hour < rollover) {
    // Step back one local calendar day using UTC arithmetic on the date parts.
    const prev = new Date(Date.UTC(year, month - 1, day));
    prev.setUTCDate(prev.getUTCDate() - 1);
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }
  return zonedTimeToUtc(timeZone, year, month, day, rollover, 0);
}

/** The next local `rolloverHour` strictly after `now` — when auto-restore fires. */
export function nextServiceRollover(now: Date, timeZone: string, rolloverHour: number): Date {
  const start = serviceDayStart(now, timeZone, rolloverHour);
  const p = zonedParts(start, timeZone);
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day));
  next.setUTCDate(next.getUTCDate() + 1);
  return zonedTimeToUtc(
    timeZone,
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    Math.min(23, Math.max(0, Math.trunc(rolloverHour))),
    0,
  );
}

/** True when the IANA zone name is one this runtime knows. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
