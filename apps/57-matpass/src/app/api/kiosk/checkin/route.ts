/**
 * src/app/api/kiosk/checkin/route.ts
 *
 * The kiosk's write endpoint.
 *
 * Authenticated by device token only — no staff session is involved, and the
 * token is re-checked against `kiosk_devices` on every request, so a revoked
 * tablet stops working immediately, even mid-session.
 *
 * Idempotent on the client-generated `clientKey`. The tablet queues taps in
 * localStorage while the wifi is out and replays them on reconnect; a replay
 * returns the original check-in with `duplicate: true` rather than inserting a
 * second one. The guarantee comes from the unique index on `checkins.client_key`
 * plus ON CONFLICT DO NOTHING — not from a read-then-write check, which two
 * tablets replaying the same queue at once would race straight through.
 *
 * Accepts a batch so a reconnecting tablet drains its whole queue in one request.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { recordCheckin, verifyDeviceToken } from "@/lib/kiosk";

export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().min(10),
  checkins: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        enrollmentId: z.string().uuid(),
        classScheduleId: z.string().uuid().nullish(),
        clientKey: z.string().min(8).max(120),
        /** When the tap actually happened, so a queued check-in keeps its time. */
        at: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const device = await verifyDeviceToken(parsed.token);
  if (!device) {
    // 403, not 401: there is no credential to re-supply. The tablet shows
    // "this kiosk has been revoked" and stops.
    return NextResponse.json({ error: "device is not active" }, { status: 403 });
  }

  const results: unknown[] = [];
  for (const entry of parsed.checkins) {
    try {
      const result = await recordCheckin({
        schoolId: device.schoolId,
        studentId: entry.studentId,
        enrollmentId: entry.enrollmentId,
        classScheduleId: entry.classScheduleId ?? null,
        clientKey: entry.clientKey,
        source: "kiosk",
        deviceId: device.deviceId,
        at: entry.at ? new Date(entry.at) : undefined,
      });
      results.push({
        clientKey: entry.clientKey,
        ok: true,
        duplicate: result.duplicate,
        studentName: result.studentName,
        rankName: result.rankName,
        beltColorHex: result.beltColorHex,
        stripesEarned: result.stripesEarned,
        stripesTotal: result.stripesTotal,
        classLabel: result.classLabel,
        classesDone: result.progress.classesDone,
        classesRequired: result.progress.classesRequired,
        eligible: result.progress.eligible,
      });
    } catch (err) {
      results.push({
        clientKey: entry.clientKey,
        ok: false,
        error: err instanceof Error ? err.message : "could not record that check-in",
      });
    }
  }

  return NextResponse.json({ results });
}
