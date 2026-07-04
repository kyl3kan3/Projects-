/**
 * src/lib/time-entries.ts
 *
 * Time entry lifecycle: create/close punches, reconcile offline-synced
 * events, flag anomalies, and record edits with a full audit trail.
 * The offline outbox on the device speaks to this module via
 * /api/punches/sync.
 *
 * TODO:
 * - [ ] recordPunch(input): insert clock-in or close the open entry on
 *       clock-out; server-side geofence re-verification (never trust the
 *       client's verdict); write geofence_status + source; serializable
 *       transaction so concurrent punches can't double-open a shift.
 * - [ ] reconcileOfflineBatch(events): idempotent ingestion keyed on
 *       (organization_id, client_event_id) unique constraint -- a punch
 *       synced twice inserts once and acks both; out-of-order arrivals
 *       reconcile by device timestamp (out before in = pair them).
 * - [ ] flagStaleOpenEntries(): auto-flag entries open past the org's max
 *       shift (default 14h) for office review -- never silently truncate.
 * - [ ] editEntry(entryId, patch, editedBy, reason): apply change, write
 *       one time_entry_edits row per changed field; reason is required.
 * - [ ] approvePeriod(orgId, periodStart, periodEnd, approvedBy): stamp
 *       approved_at and lock entries against crew-side changes.
 * - [ ] Org-scoped day/week read queries for the crew Hours screen and
 *       the owner review table.
 * - [ ] Validation (zod) for punch payloads from the PWA.
 */

import type { GeofenceStatus, PunchLocation, TimeEntrySource } from "../db/schema";

export interface PunchEvent {
  clientEventId: string;
  userId: string;
  jobId: string;
  kind: "in" | "out";
  occurredAt: Date;
  location: PunchLocation;
  source: TimeEntrySource;
}

export interface RecordedPunch {
  timeEntryId: string;
  geofenceStatus: GeofenceStatus;
  deduplicated: boolean;
}

export function recordPunch(_event: PunchEvent): Promise<RecordedPunch> {
  throw new Error("Not implemented");
}

export function reconcileOfflineBatch(
  _events: PunchEvent[],
): Promise<RecordedPunch[]> {
  throw new Error("Not implemented");
}

export function editEntry(
  _entryId: string,
  _patch: Record<string, unknown>,
  _editedBy: string,
  _reason: string,
): Promise<void> {
  throw new Error("Not implemented");
}
