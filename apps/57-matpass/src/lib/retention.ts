/**
 * src/lib/retention.ts
 *
 * The drop-off alarm. Three quiet weeks *is* the cancellation; it just hasn't
 * been emailed yet. So the scan compares a student against **their own** cadence,
 * not a global "inactive 30 days" rule: a 3x/week kid who drops to once is in
 * trouble, a 1x/week adult holding steady at once a week is not.
 *
 * ## The rule
 *
 * baseline = check-ins per week over the trailing 12 weeks, excluding the recent
 * window (so a collapse does not drag its own baseline down with it).
 * recent   = check-ins per week over the trailing 3 weeks.
 * Flag when `recent < fraction x baseline` AND at least `minDaysAbsent` days have
 * passed since the last check-in.
 *
 * ## Exclusions, each with a test
 *
 * - paused students (a pause is not a quiet quit),
 * - students who joined inside the baseline window (no cadence to compare to),
 * - students with an already-open flag (the partial unique index in the schema
 *   enforces one open flag per student, so a scan run twice is a no-op),
 * - students whose baseline is under 0.5/week — an occasional drop-in has no
 *   cadence to fall away from.
 *
 * The scan is idempotent and safe to run repeatedly. That is the bug that eats
 * these features alive: an "overdue" state stays true forever, and a naive nightly
 * sweep raises the same alarm about the same student every night for a year.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkins,
  families,
  retentionFlags,
  schools,
  students,
  users,
  type FlagStatus,
  type RetentionFlag,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { addDays, dayKey, daysBetween } from "@/lib/time";

export const BASELINE_WEEKS = 12;
export const RECENT_WEEKS = 3;
/** Below this many classes a week there is no cadence to fall away from. */
export const MIN_BASELINE_PER_WEEK = 0.5;

export interface CadenceInput {
  /** School-local days on which the student checked in, any order. */
  checkinDays: string[];
  /** The day the scan runs. */
  asOfDay: string;
  /** School-local day the student joined. */
  joinedOnDay: string | null;
  status: "active" | "paused" | "inactive";
  fraction: number;
  minDaysAbsent: number;
}

export interface CadenceVerdict {
  flag: boolean;
  reason: string;
  baselinePerWeek: number;
  recentPerWeek: number;
  lastSeenOn: string | null;
  daysSinceSeen: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The whole rule as one pure function — every exclusion is visible here, and the
 * tests drive this directly rather than through a seeded database.
 */
export function evaluateCadence(input: CadenceInput): CadenceVerdict {
  const recentStart = addDays(input.asOfDay, -RECENT_WEEKS * 7);
  const baselineStart = addDays(input.asOfDay, -BASELINE_WEEKS * 7);

  const days = [...input.checkinDays].sort();
  const inBaseline = days.filter((d) => d > baselineStart && d <= recentStart);
  const inRecent = days.filter((d) => d > recentStart && d <= input.asOfDay);
  const lastSeenOn = days.length > 0 ? days[days.length - 1] : null;
  const daysSinceSeen = lastSeenOn ? daysBetween(lastSeenOn, input.asOfDay) : null;

  const baselineWeeks = BASELINE_WEEKS - RECENT_WEEKS;
  const baselinePerWeek = round2(inBaseline.length / baselineWeeks);
  const recentPerWeek = round2(inRecent.length / RECENT_WEEKS);

  const verdict = (flag: boolean, reason: string): CadenceVerdict => ({
    flag,
    reason,
    baselinePerWeek,
    recentPerWeek,
    lastSeenOn,
    daysSinceSeen,
  });

  if (input.status === "paused") return verdict(false, "paused — a pause is not a quiet quit");
  if (input.status === "inactive") return verdict(false, "already inactive");

  if (input.joinedOnDay && daysBetween(input.joinedOnDay, input.asOfDay) < BASELINE_WEEKS * 7) {
    return verdict(false, "joined too recently to have a baseline");
  }
  if (baselinePerWeek < MIN_BASELINE_PER_WEEK) {
    return verdict(false, "no established cadence to fall away from");
  }
  if (daysSinceSeen === null) return verdict(false, "never checked in");
  if (daysSinceSeen < input.minDaysAbsent) {
    return verdict(false, `last seen ${daysSinceSeen} days ago — inside the absence window`);
  }
  if (recentPerWeek >= input.fraction * baselinePerWeek) {
    return verdict(false, "still training at their own cadence");
  }

  return verdict(
    true,
    `${recentPerWeek}/week against a baseline of ${baselinePerWeek}/week, last seen ${daysSinceSeen} days ago`,
  );
}

// ---------------------------------------------------------------- db layer

export interface ScanResult {
  flagged: number;
  autoRecovered: number;
  considered: number;
}

/**
 * The nightly scan. Idempotent: an existing open flag is left alone, and a
 * student who has resumed training closes their own flag.
 */
export async function scanSchool(schoolId: string, now = new Date()): Promise<ScanResult> {
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  if (!school) throw new Error("School not found");
  const timezone = school.timezone;
  const fraction = school.settings.retentionBaselineFraction ?? env.retentionBaselineFraction;
  const minDaysAbsent = school.settings.retentionMinDaysAbsent ?? env.retentionMinDaysAbsent;
  const asOfDay = dayKey(now, timezone);

  const roster = await db
    .select({ id: students.id, status: students.status, joinedOn: students.joinedOn })
    .from(students)
    .where(eq(students.schoolId, schoolId));
  if (roster.length === 0) return { flagged: 0, autoRecovered: 0, considered: 0 };

  const attendance = await db
    .select({ studentId: checkins.studentId, at: checkins.checkedInAt })
    .from(checkins)
    .where(inArray(checkins.studentId, roster.map((s) => s.id)));
  const byStudent = new Map<string, string[]>();
  for (const row of attendance) {
    const key = dayKey(row.at, timezone);
    const list = byStudent.get(row.studentId);
    if (list) list.push(key);
    else byStudent.set(row.studentId, [key]);
  }

  const openFlags = await db
    .select({ flag: retentionFlags })
    .from(retentionFlags)
    .where(
      and(
        inArray(retentionFlags.studentId, roster.map((s) => s.id)),
        inArray(retentionFlags.status, ["open", "contacted"]),
      ),
    );
  const openByStudent = new Map(openFlags.map((f) => [f.flag.studentId, f.flag]));

  let flagged = 0;
  let autoRecovered = 0;

  for (const student of roster) {
    const verdict = evaluateCadence({
      checkinDays: byStudent.get(student.id) ?? [],
      asOfDay,
      joinedOnDay: student.joinedOn ? dayKey(student.joinedOn, timezone) : null,
      status: student.status,
      fraction,
      minDaysAbsent,
    });

    const open = openByStudent.get(student.id);
    if (open) {
      // Recovered: back to at least the baseline fraction and seen recently.
      const resumed =
        verdict.recentPerWeek >= fraction * Number(open.baselinePerWeek) &&
        (verdict.daysSinceSeen ?? 999) < minDaysAbsent;
      if (resumed) {
        await db
          .update(retentionFlags)
          .set({ status: "recovered", updatedAt: new Date() })
          .where(eq(retentionFlags.id, open.id));
        await audit({
          schoolId,
          action: "retention.auto_recovered",
          target: open.id,
          metadata: { studentId: student.id, recentPerWeek: verdict.recentPerWeek },
        });
        autoRecovered += 1;
      }
      continue;
    }

    if (!verdict.flag) continue;

    // The partial unique index is the real guard; onConflictDoNothing turns a
    // concurrent second scan into a no-op rather than an error.
    const inserted = await db
      .insert(retentionFlags)
      .values({
        studentId: student.id,
        flaggedOn: now,
        baselinePerWeek: verdict.baselinePerWeek.toFixed(2),
        recentPerWeek: verdict.recentPerWeek.toFixed(2),
        lastSeenOn: verdict.lastSeenOn ? new Date(`${verdict.lastSeenOn}T12:00:00Z`) : null,
        status: "open",
      })
      .onConflictDoNothing()
      .returning({ id: retentionFlags.id });
    if (inserted.length > 0) {
      flagged += 1;
      await audit({
        schoolId,
        action: "retention.flagged",
        target: inserted[0].id,
        metadata: { studentId: student.id, why: verdict.reason },
      });
    }
  }

  return { flagged, autoRecovered, considered: roster.length };
}

export interface FlagCard {
  flagId: string;
  studentId: string;
  studentName: string;
  familyName: string;
  familyEmail: string | null;
  familyPhone: string | null;
  baselinePerWeek: number;
  recentPerWeek: number;
  daysSinceSeen: number | null;
  lastSeenOn: Date | null;
  status: FlagStatus;
  outcomeNote: string;
  handledByName: string | null;
  flaggedOn: Date;
}

/** Open flags, sorted by days-since-seen — the call sheet, worst first. */
export async function flagList(
  schoolId: string,
  options: { statuses?: FlagStatus[]; now?: Date } = {},
): Promise<FlagCard[]> {
  const db = getDb();
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId));
  const timezone = school?.timezone ?? "America/Chicago";
  const asOfDay = dayKey(options.now ?? new Date(), timezone);

  const rows = await db
    .select({
      flag: retentionFlags,
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      familyName: families.name,
      familyEmail: families.email,
      familyPhone: families.phone,
      handledByName: users.name,
    })
    .from(retentionFlags)
    .innerJoin(students, eq(students.id, retentionFlags.studentId))
    .innerJoin(families, eq(families.id, students.familyId))
    .leftJoin(users, eq(users.id, retentionFlags.handledBy))
    .where(
      and(
        eq(students.schoolId, schoolId),
        inArray(retentionFlags.status, options.statuses ?? ["open", "contacted"]),
      ),
    )
    .orderBy(asc(retentionFlags.lastSeenOn), desc(retentionFlags.flaggedOn));

  return rows.map((r) => ({
    flagId: r.flag.id,
    studentId: r.studentId,
    studentName: `${r.firstName} ${r.lastName}`,
    familyName: r.familyName,
    familyEmail: r.familyEmail,
    familyPhone: r.familyPhone,
    baselinePerWeek: Number(r.flag.baselinePerWeek),
    recentPerWeek: Number(r.flag.recentPerWeek),
    lastSeenOn: r.flag.lastSeenOn,
    daysSinceSeen: r.flag.lastSeenOn
      ? daysBetween(dayKey(r.flag.lastSeenOn, timezone), asOfDay)
      : null,
    status: r.flag.status,
    outcomeNote: r.flag.outcomeNote,
    handledByName: r.handledByName,
    flaggedOn: r.flag.flaggedOn,
  }));
}

/** "7 flags this month, 4 recovered" — the loop the owner report celebrates. */
export async function flagTally(
  schoolId: string,
  sinceDays = 90,
  now = new Date(),
): Promise<{ opened: number; recovered: number; lost: number; contacted: number }> {
  const db = getDb();
  const since = new Date(now.getTime() - sinceDays * 86_400_000);
  const rows = await db
    .select({ status: retentionFlags.status, flaggedOn: retentionFlags.flaggedOn })
    .from(retentionFlags)
    .innerJoin(students, eq(students.id, retentionFlags.studentId))
    .where(eq(students.schoolId, schoolId));
  const recent = rows.filter((r) => r.flaggedOn >= since);
  return {
    opened: recent.length,
    recovered: recent.filter((r) => r.status === "recovered").length,
    lost: recent.filter((r) => r.status === "lost").length,
    contacted: recent.filter((r) => r.status === "contacted").length,
  };
}

/** One-tap outcome from the flag card. Always audited, always attributed. */
export async function disposition(input: {
  flagId: string;
  schoolId: string;
  actorId: string;
  status: Extract<FlagStatus, "contacted" | "recovered" | "lost">;
  note?: string;
}): Promise<void> {
  const db = getDb();
  const [flag] = await db
    .select({ id: retentionFlags.id, studentId: retentionFlags.studentId })
    .from(retentionFlags)
    .innerJoin(students, eq(students.id, retentionFlags.studentId))
    .where(and(eq(retentionFlags.id, input.flagId), eq(students.schoolId, input.schoolId)));
  if (!flag) throw new Error("Flag not found");

  await db
    .update(retentionFlags)
    .set({
      status: input.status,
      outcomeNote: input.note?.trim() ?? "",
      handledBy: input.actorId,
      updatedAt: new Date(),
    })
    .where(eq(retentionFlags.id, input.flagId));

  // Marked lost: the roster should stop counting them as active, and the scan
  // should stop looking at them.
  if (input.status === "lost") {
    await db
      .update(students)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(students.id, flag.studentId));
  }

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: `retention.${input.status}`,
    target: input.flagId,
    metadata: { note: input.note ?? "" },
  });
}

/** Open/contacted flags keyed by student — the red-flag glyph on a roster row. */
export async function openFlagsByStudent(schoolId: string): Promise<Map<string, RetentionFlag>> {
  const db = getDb();
  const rows = await db
    .select({ flag: retentionFlags })
    .from(retentionFlags)
    .innerJoin(students, eq(students.id, retentionFlags.studentId))
    .where(
      and(
        eq(students.schoolId, schoolId),
        inArray(retentionFlags.status, ["open", "contacted"]),
      ),
    );
  return new Map(rows.map((r) => [r.flag.studentId, r.flag]));
}
