/**
 * The timezone list offered in the policy editor.
 *
 * Kept out of `schedule.ts` because that module imports `cron-parser`, and the
 * editor is a client component — importing the schedule module there dragged a
 * 30 kB cron parser into the browser bundle for the sake of a string array.
 *
 * A short, honest list beats a 400-entry select on a 390px screen; anything else
 * can be stored and is validated server-side.
 */

export const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Lisbon",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
