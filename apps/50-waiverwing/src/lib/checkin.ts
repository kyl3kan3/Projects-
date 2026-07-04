/**
 * src/lib/checkin.ts
 *
 * Check-in: the staff-side daily loop. Records that coverage was
 * verified at entry by pinning the proving signature.
 *
 * TODO:
 * - [ ] checkIn(locationId, participantId, byUserId?): resolve current
 *       valid signature (via lib/search coverage); write checkins row
 *       with signature_id; reject with a typed error when coverage is
 *       expired/none (UI swaps the action to re-sign).
 * - [ ] todayBoard(locationId): signed-today + checked-in rows for the
 *       home screen, newest first, location-timezone day boundaries.
 * - [ ] Self check-in variant for QR flows that end in a same-day visit
 *       (by_user_id null).
 * - [ ] Re-sign prompt: issue a fresh tokenized sign link for expired
 *       participants (one tap from the amber row).
 * - [ ] Day stats for the header: `214 SIGNED · 186 IN` (mono, DESIGN.md).
 */

export interface CheckinResult {
  checkinId: string;
  signatureId: string;
}

export function checkIn(
  _locationId: string,
  _participantId: string,
  _byUserId?: string,
): Promise<CheckinResult> {
  throw new Error("Not implemented");
}
