/**
 * src/lib/tz.ts
 *
 * Wall-clock time in a named zone ↔ instants.
 *
 * A rate con says "08/04 07:00–15:00" and means seven in the morning where the
 * receiver's dock is. The driver's phone might be an hour off that and the
 * office laptop two. Every appointment window in this app is entered and read as
 * wall time in the carrier's timezone and stored as an instant, which is the
 * only pair of representations that survives a truck crossing a time zone.
 *
 * Implemented on `Intl` rather than a tz database dependency: two rounds of
 * offset correction converge for every real zone, including the hour that
 * repeats at the end of daylight saving.
 */

/** Parse "2026-08-04T07:00" (no zone) into its parts, or null. */
export function parseWallTime(
  value: string,
): { year: number; month: number; day: number; hour: number; minute: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: m[4] ? Number(m[4]) : 0,
    minute: m[5] ? Number(m[5]) : 0,
  };
}

/** The zone's offset from UTC, in minutes, at a given instant. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * "2026-08-04T07:00" in America/Chicago → the instant that is. Returns null when
 * the string is not a wall time at all, so a bad parse cannot become midnight
 * on the epoch.
 */
export function wallTimeToInstant(value: string, timeZone: string): Date | null {
  const parts = parseWallTime(value);
  if (!parts) return null;
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  let instant = new Date(naive);
  for (let i = 0; i < 2; i++) {
    const offset = zoneOffsetMinutes(instant, timeZone);
    instant = new Date(naive - offset * 60_000);
  }
  return instant;
}

/** The inverse: an instant rendered as "2026-08-04T07:00" in the zone. */
export function instantToWallTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** A short list of the zones an American trucking business actually sits in. */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
] as const;
