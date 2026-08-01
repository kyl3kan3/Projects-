/**
 * US state and territory codes, for the service-geography picker and for
 * validating what comes back from it. Kept out of the server-action module because
 * a `"use server"` file may only export async functions.
 */

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
  "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
  "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "PR", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export type UsState = (typeof US_STATES)[number];

export function isUsState(value: string): boolean {
  return (US_STATES as readonly string[]).includes(value);
}

/**
 * A handful of IANA zones covering the US, plus UTC. Not exhaustive on purpose: the
 * settings screen also accepts any zone the runtime knows, and offering 400 options
 * to someone who wants "Eastern" is a worse question than offering six.
 */
export const COMMON_TIMEZONES = [
  { id: "America/New_York", label: "Eastern — New York" },
  { id: "America/Chicago", label: "Central — Chicago" },
  { id: "America/Denver", label: "Mountain — Denver" },
  { id: "America/Phoenix", label: "Mountain, no DST — Phoenix" },
  { id: "America/Los_Angeles", label: "Pacific — Los Angeles" },
  { id: "America/Anchorage", label: "Alaska — Anchorage" },
  { id: "Pacific/Honolulu", label: "Hawaii — Honolulu" },
  { id: "America/Puerto_Rico", label: "Atlantic — San Juan" },
  { id: "UTC", label: "UTC" },
] as const;
