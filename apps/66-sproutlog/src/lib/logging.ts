/**
 * src/lib/logging.ts
 *
 * The tap-logging spine: append log_events, never edit. Corrections
 * append a corrective event referencing the original in data.
 *
 * TODO:
 * - [ ] appendEvent(input): validation per kind (nap_end requires an
 *       open nap_start; departure requires arrival today).
 * - [ ] dayStream(providerId, date): the day's events for the ribbon
 *       + digest compiler.
 * - [ ] ratioNow(providerId): arrivals minus departures today vs.
 *       license_capacity; appends ratio_flag when exceeded (once per
 *       excursion).
 * - [ ] rebuildAttendance(providerId, dateRange): the projection —
 *       deterministic from the stream.
 */

export interface AppendEventInput {
  providerId: string;
  childId: string | null;
  kind:
    | "arrival"
    | "departure"
    | "meal"
    | "nap_start"
    | "nap_end"
    | "diaper"
    | "potty"
    | "incident"
    | "photo"
    | "note";
  data: Record<string, unknown>;
  loggedBy: string;
}

export async function appendEvent(input: AppendEventInput): Promise<{ eventId: string }> {
  throw new Error("Not implemented");
}

export async function ratioNow(
  providerId: string,
): Promise<{ present: number; capacity: number; over: boolean }> {
  throw new Error("Not implemented");
}
