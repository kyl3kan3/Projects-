/**
 * src/lib/signoff.ts
 *
 * Sign-off capture and the offline sync contract. The crew PWA writes to
 * a local outbox; this module owns the server side: validation, idempotent
 * ingestion, immutability.
 *
 * TODO:
 * - [ ] Sync payload schema (zod): { instanceToken, deviceId, signOffs:
 *       [{ employeeId, signatureSvgPath, signedAtDevice }], sitePhoto?,
 *       gps? } -- validated hard; reject unknown employees.
 * - [ ] ingestSync(payload): verify crew token; upsert-idempotent by
 *       (instance, employee, deviceId); store signature to R2 (SVG path ->
 *       rendered PNG for the binder); record BOTH device and server
 *       timestamps -- never falsify either.
 * - [ ] Immutability: a synced sign_off can never be updated or deleted;
 *       voiding appends a correction event (audit trail preserved).
 * - [ ] Conflict rule: two devices signing the same instance merge by
 *       employee -- first sync wins per employee, duplicates dropped
 *       silently (same person can't sign twice).
 * - [ ] completeInstance: all-roster-signed (or foreman closes with
 *       absentees noted) -> status completed, completed_at, notify ops.
 * - [ ] attendanceMatrix(companyId, range): the employees x weeks pivot
 *       for the dashboard and the binder.
 */

export function ingestSync(): Promise<void> {
  throw new Error("Not implemented");
}

export function attendanceMatrix(): Promise<unknown> {
  throw new Error("Not implemented");
}
