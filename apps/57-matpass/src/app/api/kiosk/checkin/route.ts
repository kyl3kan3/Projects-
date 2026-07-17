/**
 * src/app/api/kiosk/checkin/route.ts
 *
 * The kiosk's check-in endpoint: device-token authenticated, idempotent by
 * client key, safe under offline replay.
 *
 * TODO:
 * - [ ] POST: verify the device token (src/lib/kiosk) — staff sessions are
 *       NOT accepted here; revoked devices get 401.
 * - [ ] zod-validate {studentId, enrollmentId, classScheduleId?,
 *       clientKey, checkedInAt?} (checkedInAt supports offline-queued
 *       timestamps).
 * - [ ] Delegate to recordCheckin() — duplicate clientKey returns the
 *       existing row with {duplicate: true}, HTTP 200 (sync must be
 *       replay-safe, never an error).
 * - [ ] Response carries the enrollment's updated progress numbers for
 *       the kiosk's counter-tick beat.
 * - [ ] Also handle batch sync: an array of queued check-ins processed
 *       in order, each idempotent.
 */

export async function POST(_req: Request): Promise<Response> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  return new Response("Not implemented", { status: 501 });
}
