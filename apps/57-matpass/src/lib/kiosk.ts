/**
 * src/lib/kiosk.ts
 *
 * Kiosk device tokens and the idempotent check-in write path. The door
 * tablet's entire trust model lives here.
 *
 * TODO:
 * - [ ] mintDeviceToken() / verifyDeviceToken(): signed tokens (jose,
 *       KIOSK_TOKEN_SECRET); hash stored on kiosk_devices; verification
 *       checks status = active — revocation bricks the device instantly.
 * - [ ] revokeDevice(): flip status, audit-log.
 * - [ ] recordCheckin(): insert with the client-generated idempotency key
 *       (unique client_key makes offline-sync replays safe — return the
 *       existing row on conflict, never error); attach to the nearest
 *       scheduled class for the enrollment's program; bump last_seen_at
 *       on the device.
 * - [ ] searchStudents(): kiosk search (3+ letters or PIN), active
 *       students only, returns name + photo key + belt-bar data — nothing
 *       else leaves the endpoint (minors' data discipline).
 * - [ ] Desk fallback shares recordCheckin() with source = desk.
 */

export async function verifyDeviceToken(
  _token: string,
): Promise<{ deviceId: string; schoolId: string } | null> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  throw new Error("Not implemented");
}

export async function recordCheckin(_input: {
  deviceId?: string;
  studentId: string;
  enrollmentId: string;
  classScheduleId?: string;
  clientKey: string;
  source: "kiosk" | "desk";
}): Promise<{ checkinId: string; duplicate: boolean }> {
  throw new Error("Not implemented");
}
