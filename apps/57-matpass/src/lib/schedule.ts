/**
 * The weekly class schedule, and the rule that decides which class a check-in
 * belongs to.
 *
 * A student taps "check in" at 5:52pm for a 6:00pm class, or at 7:05pm as the
 * 6:00pm class is finishing. Both are that class. Someone dropping in at 2pm on
 * a day with nothing scheduled is an open mat, and gets no class attached rather
 * than the wrong one — attendance that lies about which class it was makes the
 * per-class analytics worthless later.
 *
 * The matcher is pure so it can be tested at every boundary.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { classSchedule, programs, users, type ClassSlot } from "@/db/schema";
import { formatMinutes, WEEKDAY_SHORT, zonedParts } from "@/lib/time";

/** How early a check-in may precede a class and still count as that class. */
export const EARLY_WINDOW_MINUTES = 45;
/** How long after a class starts a check-in still counts as that class. */
export const LATE_GRACE_MINUTES = 20;

export interface SlotLike {
  id: string;
  weekday: number;
  startsAtMinutes: number;
  durationMinutes: number;
}

/**
 * The class a check-in attaches to.
 *
 * Candidates are slots on the same local weekday whose window contains the tap.
 * Among them, a class that is *actually in session* beats one that has not
 * started — otherwise a back-to-back 6:00/7:00 pair sends a 6:40 arrival to the
 * 7:00 class, which is nearer in minutes and plainly the wrong answer. After
 * that: nearest start, then the earlier class.
 */
export function nearestSlot<T extends SlotLike>(
  slots: T[],
  at: { weekday: number; minutes: number },
): T | null {
  let best: T | null = null;
  let bestRank: [number, number, number] | null = null;

  for (const slot of slots) {
    if (slot.weekday !== at.weekday) continue;
    const opens = slot.startsAtMinutes - EARLY_WINDOW_MINUTES;
    const ends = slot.startsAtMinutes + slot.durationMinutes;
    const closes = ends + LATE_GRACE_MINUTES;
    if (at.minutes < opens || at.minutes > closes) continue;

    const inSession = at.minutes >= slot.startsAtMinutes && at.minutes <= ends;
    const rank: [number, number, number] = [
      inSession ? 0 : 1,
      Math.abs(at.minutes - slot.startsAtMinutes),
      slot.startsAtMinutes,
    ];
    if (bestRank === null || lessThan(rank, bestRank)) {
      best = slot;
      bestRank = rank;
    }
  }
  return best;
}

function lessThan(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** The label DESIGN.md's chip row shows: "Adults Gi · Tue 6:00pm". */
export function slotLabel(slot: Pick<ClassSlot, "name" | "weekday" | "startsAtMinutes">): string {
  return `${slot.name} · ${WEEKDAY_SHORT[slot.weekday]} ${formatMinutes(slot.startsAtMinutes)}`;
}

// ---------------------------------------------------------------- db layer

export interface ScheduleRow extends ClassSlot {
  programName: string;
  instructorName: string | null;
}

export async function listSchedule(schoolId: string): Promise<ScheduleRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      slot: classSchedule,
      programName: programs.name,
      instructorName: users.name,
    })
    .from(classSchedule)
    .innerJoin(programs, eq(programs.id, classSchedule.programId))
    .leftJoin(users, eq(users.id, classSchedule.instructorId))
    .where(and(eq(programs.schoolId, schoolId), eq(classSchedule.status, "active")))
    .orderBy(asc(classSchedule.weekday), asc(classSchedule.startsAtMinutes));
  return rows.map((r) => ({ ...r.slot, programName: r.programName, instructorName: r.instructorName }));
}

/** Today's classes for a set of programs, in school-local time. */
export async function slotsForPrograms(programIds: string[]): Promise<ClassSlot[]> {
  if (programIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(classSchedule)
    .where(and(inArray(classSchedule.programId, programIds), eq(classSchedule.status, "active")))
    .orderBy(asc(classSchedule.startsAtMinutes));
}

/**
 * Resolve the class for a check-in: the nearest active slot in the enrollment's
 * program, or null for an open mat.
 */
export async function resolveClassForCheckin(
  programId: string,
  at: Date,
  timezone: string,
): Promise<ClassSlot | null> {
  const slots = await slotsForPrograms([programId]);
  const parts = zonedParts(at, timezone);
  return nearestSlot(slots, parts);
}
