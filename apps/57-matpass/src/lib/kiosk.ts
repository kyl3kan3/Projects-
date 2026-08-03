/**
 * src/lib/kiosk.ts
 *
 * The door tablet's entire trust model, and the idempotent check-in write path.
 *
 * The kiosk is credential-free: it holds a signed device token in its URL and
 * nothing else. The token proves *which device* is talking; the row in
 * `kiosk_devices` decides whether that device is still allowed to. Revocation
 * flips the row, so the next request from a stolen tablet fails even though its
 * signature is still perfectly valid. No staff session is reachable from the
 * kiosk route, and the search endpoint returns names and belt data only —
 * no birthdates, no guardian contact, no billing state (minors' data
 * discipline, README risk 6).
 *
 * Check-ins are idempotent on a client-generated key. The tablet queues taps
 * while the dojo wifi is down and replays them on reconnect; replaying the same
 * key returns the original check-in instead of inserting a second one, which is
 * what makes "3 check-ins queued — will sync" safe to promise.
 */

import { createHash, randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkins,
  enrollments,
  kioskDevices,
  programs,
  ranks,
  schools,
  students,
  type KioskDevice,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { computeProgress, type Progress } from "@/lib/progression";
import { resolveClassForCheckin, slotsForPrograms } from "@/lib/schedule";
import { dayKey } from "@/lib/time";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.kioskTokenSecret);
}

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a device token. The signature carries the device id; the hash of the
 * token is stored so a leaked database row cannot be replayed as a token.
 */
export async function mintDeviceToken(input: {
  schoolId: string;
  name: string;
  locationId?: string | null;
  actorId?: string;
}): Promise<{ device: KioskDevice; token: string }> {
  const db = getDb();
  const deviceId = randomUUID();
  const token = await new SignJWT({ deviceId, schoolId: input.schoolId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(deviceId)
    .sign(secretKey());

  const [device] = await db
    .insert(kioskDevices)
    .values({
      id: deviceId,
      schoolId: input.schoolId,
      locationId: input.locationId ?? null,
      name: input.name.trim() || "Front door tablet",
      tokenHash: fingerprint(token),
      status: "active",
    })
    .returning();

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "kiosk.device_created",
    target: device.id,
    metadata: { name: device.name },
  });
  return { device, token };
}

export async function verifyDeviceToken(
  token: string,
): Promise<{ deviceId: string; schoolId: string; deviceName: string; timezone: string } | null> {
  let deviceId: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    deviceId = String(payload.deviceId ?? payload.sub ?? "");
  } catch {
    return null;
  }
  if (!deviceId) return null;

  const db = getDb();
  const [row] = await db
    .select({ device: kioskDevices, timezone: schools.timezone })
    .from(kioskDevices)
    .innerJoin(schools, eq(schools.id, kioskDevices.schoolId))
    .where(eq(kioskDevices.id, deviceId));
  if (!row) return null;
  // A revoked device is dead even though its signature verifies.
  if (row.device.status !== "active") return null;
  if (row.device.tokenHash !== fingerprint(token)) return null;

  return {
    deviceId: row.device.id,
    schoolId: row.device.schoolId,
    deviceName: row.device.name,
    timezone: row.timezone,
  };
}

export async function touchDevice(deviceId: string): Promise<void> {
  const db = getDb();
  await db.update(kioskDevices).set({ lastSeenAt: new Date() }).where(eq(kioskDevices.id, deviceId));
}

export async function revokeDevice(input: {
  deviceId: string;
  schoolId: string;
  actorId?: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(kioskDevices)
    .set({ status: "revoked" })
    .where(and(eq(kioskDevices.id, input.deviceId), eq(kioskDevices.schoolId, input.schoolId)));
  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "kiosk.device_revoked",
    target: input.deviceId,
  });
}

export async function listDevices(schoolId: string): Promise<KioskDevice[]> {
  const db = getDb();
  return db
    .select()
    .from(kioskDevices)
    .where(eq(kioskDevices.schoolId, schoolId))
    .orderBy(desc(kioskDevices.createdAt));
}

// ------------------------------------------------------------------ search

export interface KioskEnrollmentView {
  enrollmentId: string;
  programId: string;
  programName: string;
  rankName: string;
  beltColorHex: string;
  stripesTotal: number;
  stripesEarned: number;
  progress: Progress;
  classes: { id: string; label: string; startsAtMinutes: number }[];
  preselectedClassId: string | null;
}

export interface KioskStudentView {
  studentId: string;
  name: string;
  photoKey: string | null;
  enrollments: KioskEnrollmentView[];
}

/**
 * Kiosk search: 3+ letters of a name, or a full PIN. Active students only, and
 * the projection is deliberately narrow — name, photo key, belt state, classes.
 */
export async function searchStudents(input: {
  schoolId: string;
  query: string;
  timezone: string;
  now?: Date;
}): Promise<KioskStudentView[]> {
  const raw = input.query.trim();
  const isPin = /^\d{4,6}$/.test(raw);
  if (!isPin && raw.length < 3) return [];

  const db = getDb();
  const term = `%${raw}%`;
  const rows = await db
    .select({
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      photoKey: students.photoKey,
    })
    .from(students)
    .where(
      and(
        eq(students.schoolId, input.schoolId),
        eq(students.status, "active"),
        isPin
          ? eq(students.kioskPin, raw)
          : or(
              ilike(students.firstName, term),
              ilike(students.lastName, term),
              ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, term),
            ),
      ),
    )
    .orderBy(asc(students.firstName), asc(students.lastName))
    .limit(12);

  if (rows.length === 0) return [];
  return enrollmentViews(rows, input.timezone, input.now ?? new Date());
}

/** The same projection for one known student — the kiosk card after a tap. */
export async function kioskStudent(input: {
  schoolId: string;
  studentId: string;
  timezone: string;
  now?: Date;
}): Promise<KioskStudentView | null> {
  const db = getDb();
  const rows = await db
    .select({
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      photoKey: students.photoKey,
    })
    .from(students)
    .where(and(eq(students.schoolId, input.schoolId), eq(students.id, input.studentId)));
  if (rows.length === 0) return null;
  const views = await enrollmentViews(rows, input.timezone, input.now ?? new Date());
  return views[0] ?? null;
}

async function enrollmentViews(
  rows: { studentId: string; firstName: string; lastName: string; photoKey: string | null }[],
  timezone: string,
  now: Date,
): Promise<KioskStudentView[]> {
  const db = getDb();
  const studentIds = rows.map((r) => r.studentId);
  const enrolled = await db
    .select({
      enrollment: enrollments,
      rank: ranks,
      programId: programs.id,
      programName: programs.name,
    })
    .from(enrollments)
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(and(inArray(enrollments.studentId, studentIds), eq(enrollments.status, "active")));

  const programIds = [...new Set(enrolled.map((e) => e.programId))];
  const slots = await slotsForPrograms(programIds);
  const { zonedParts } = await import("@/lib/time");
  const nowParts = zonedParts(now, timezone);
  const { nearestSlot, slotLabel } = await import("@/lib/schedule");

  const counts = await checkinCountsSince(enrolled.map((e) => ({ id: e.enrollment.id, since: e.enrollment.promotedAt })));

  return rows.map((student) => ({
    studentId: student.studentId,
    name: `${student.firstName} ${student.lastName}`,
    photoKey: student.photoKey,
    enrollments: enrolled
      .filter((e) => e.enrollment.studentId === student.studentId)
      .map((e) => {
        const programSlots = slots.filter((s) => s.programId === e.programId);
        const preselected = nearestSlot(programSlots, nowParts);
        const todays = programSlots
          .filter((s) => s.weekday === nowParts.weekday)
          .map((s) => ({ id: s.id, label: slotLabel(s), startsAtMinutes: s.startsAtMinutes }));
        return {
          enrollmentId: e.enrollment.id,
          programId: e.programId,
          programName: e.programName,
          rankName: e.rank.name,
          beltColorHex: e.rank.beltColorHex,
          stripesTotal: e.rank.stripes,
          stripesEarned: e.enrollment.currentStripes,
          progress: computeProgress({
            rank: e.rank,
            currentStripes: e.enrollment.currentStripes,
            classesSince: counts.get(e.enrollment.id) ?? 0,
            promotedOn: dayKey(e.enrollment.promotedAt, timezone),
            asOfDay: dayKey(now, timezone),
            signoffDone: Boolean(e.enrollment.signoffAt),
          }),
          classes: todays,
          preselectedClassId: preselected?.id ?? null,
        };
      }),
  }));
}

async function checkinCountsSince(
  wanted: { id: string; since: Date }[],
): Promise<Map<string, number>> {
  if (wanted.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({ enrollmentId: checkins.enrollmentId, at: checkins.checkedInAt })
    .from(checkins)
    .where(inArray(checkins.enrollmentId, wanted.map((w) => w.id)));
  const since = new Map(wanted.map((w) => [w.id, w.since.getTime()]));
  const out = new Map<string, number>();
  for (const row of rows) {
    const from = since.get(row.enrollmentId);
    if (from === undefined || row.at.getTime() < from) continue;
    out.set(row.enrollmentId, (out.get(row.enrollmentId) ?? 0) + 1);
  }
  return out;
}

// ------------------------------------------------------------- the write

export interface CheckinResult {
  checkinId: string;
  duplicate: boolean;
  /** Progress after the check-in — the beats the kiosk plays. */
  progress: Progress;
  studentName: string;
  rankName: string;
  beltColorHex: string;
  stripesEarned: number;
  stripesTotal: number;
  classLabel: string | null;
}

/**
 * Record a check-in. Shared by the kiosk and the desk fallback — one write path,
 * so a late arrival entered at the desk feeds progression exactly as a tap does.
 *
 * Billing state is deliberately not consulted. A past-due family's kid checks in;
 * the desk has the conversation (ARCHITECTURE.md flow 3.4). There is a test.
 */
export async function recordCheckin(input: {
  schoolId: string;
  studentId: string;
  enrollmentId: string;
  clientKey: string;
  source: "kiosk" | "desk";
  deviceId?: string | null;
  classScheduleId?: string | null;
  at?: Date;
}): Promise<CheckinResult> {
  const db = getDb();
  const at = input.at ?? new Date();

  const [row] = await db
    .select({
      enrollment: enrollments,
      rank: ranks,
      programId: programs.id,
      firstName: students.firstName,
      lastName: students.lastName,
      timezone: schools.timezone,
    })
    .from(enrollments)
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .where(
      and(
        eq(enrollments.id, input.enrollmentId),
        eq(enrollments.studentId, input.studentId),
        eq(students.schoolId, input.schoolId),
      ),
    );
  if (!row) throw new Error("That student is not enrolled in this program");
  if (row.enrollment.status === "ended") throw new Error("That enrollment has ended");

  let classScheduleId = input.classScheduleId ?? null;
  if (!classScheduleId) {
    const slot = await resolveClassForCheckin(row.programId, at, row.timezone);
    classScheduleId = slot?.id ?? null;
  }

  // Idempotent on the client key: a replayed offline queue inserts nothing and
  // reads back the original row.
  const inserted = await db
    .insert(checkins)
    .values({
      studentId: input.studentId,
      enrollmentId: input.enrollmentId,
      classScheduleId,
      checkedInAt: at,
      source: input.source,
      deviceId: input.deviceId ?? null,
      clientKey: input.clientKey,
    })
    .onConflictDoNothing({ target: checkins.clientKey })
    .returning();

  let checkinId: string;
  let duplicate = false;
  if (inserted.length > 0) {
    checkinId = inserted[0].id;
  } else {
    const [existing] = await db
      .select({ id: checkins.id, classScheduleId: checkins.classScheduleId })
      .from(checkins)
      .where(eq(checkins.clientKey, input.clientKey));
    if (!existing) throw new Error("Could not record that check-in — try again");
    checkinId = existing.id;
    classScheduleId = existing.classScheduleId;
    duplicate = true;
  }

  if (input.deviceId) await touchDevice(input.deviceId);

  // A returning student closes their own open retention flag — the alarm should
  // switch itself off when the thing it was worried about stops being true.
  await autoRecoverOnCheckin(input.studentId, input.schoolId);

  const counts = await checkinCountsSince([
    { id: input.enrollmentId, since: row.enrollment.promotedAt },
  ]);
  const progress = computeProgress({
    rank: row.rank,
    currentStripes: row.enrollment.currentStripes,
    classesSince: counts.get(input.enrollmentId) ?? 0,
    promotedOn: dayKey(row.enrollment.promotedAt, row.timezone),
    asOfDay: dayKey(at, row.timezone),
    signoffDone: Boolean(row.enrollment.signoffAt),
  });

  let classLabel: string | null = null;
  if (classScheduleId) {
    const slots = await slotsForPrograms([row.programId]);
    const slot = slots.find((s) => s.id === classScheduleId);
    if (slot) {
      const { slotLabel } = await import("@/lib/schedule");
      classLabel = slotLabel(slot);
    }
  }

  return {
    checkinId,
    duplicate,
    progress,
    studentName: `${row.firstName} ${row.lastName}`,
    rankName: row.rank.name,
    beltColorHex: row.rank.beltColorHex,
    stripesEarned: row.enrollment.currentStripes,
    stripesTotal: row.rank.stripes,
    classLabel,
  };
}

async function autoRecoverOnCheckin(studentId: string, schoolId: string): Promise<void> {
  const { retentionFlags } = await import("@/db/schema");
  const db = getDb();
  const updated = await db
    .update(retentionFlags)
    .set({ status: "recovered", updatedAt: new Date() })
    .where(and(eq(retentionFlags.studentId, studentId), inArray(retentionFlags.status, ["open", "contacted"])))
    .returning({ id: retentionFlags.id });
  for (const flag of updated) {
    await audit({
      schoolId,
      action: "retention.auto_recovered",
      target: flag.id,
      metadata: { studentId, reason: "check-in resumed" },
    });
  }
}
