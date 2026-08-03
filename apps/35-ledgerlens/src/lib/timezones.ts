/**
 * The timezone choices offered in settings.
 *
 * A short, real list rather than the full IANA database: the target user is a US solo
 * operator, and a 400-entry select on a phone is a worse experience than an honest
 * "ask us" for the rest. The zone matters because it decides which calendar month a
 * receipt photographed at 11pm on the 31st belongs to.
 */

export const TIME_ZONES = [
  { id: "America/New_York", label: "Eastern — New York" },
  { id: "America/Chicago", label: "Central — Chicago" },
  { id: "America/Denver", label: "Mountain — Denver" },
  { id: "America/Phoenix", label: "Mountain, no DST — Phoenix" },
  { id: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { id: "America/Anchorage", label: "Alaska — Anchorage" },
  { id: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
  { id: "UTC", label: "UTC" },
] as const;

export const TIME_ZONE_IDS: string[] = TIME_ZONES.map((z) => z.id);

export const WEEKDAYS = [
  { id: 0, label: "Sunday" },
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
] as const;
