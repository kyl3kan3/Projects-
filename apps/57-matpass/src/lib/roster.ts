/**
 * The roster: families, students, enrollments, and the CSV import that gets a
 * school's 150 kids in during one evening.
 *
 * Guardian contact lives on the family, never on the child (README risk 6). The
 * student row holds a name, an optional birthdate, an optional photo key and
 * notes; every email and phone number in the product is a family's.
 */

import { and, asc, count, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkins,
  enrollments,
  families,
  membershipPlans,
  programs,
  ranks,
  retentionFlags,
  students,
  subscriptions,
  type Enrollment,
  type Family,
  type Student,
  type StudentStatus,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { parseStudentCsv, type ImportRow } from "@/lib/csv";
import { computeProgress, type Progress } from "@/lib/progression";
import { dayKey, daysBetween, startOfDay } from "@/lib/time";

// ------------------------------------------------------------------ create

export async function createFamily(input: {
  schoolId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string;
}): Promise<Family> {
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Give the household a name");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("That guardian email address does not look right");
  }
  const db = getDb();
  const [family] = await db
    .insert(families)
    .values({
      schoolId: input.schoolId,
      name,
      email,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() ?? "",
    })
    .returning();
  return family;
}

/** A free PIN for a school: the smallest unused 4-digit code from 1000. */
export async function nextKioskPin(schoolId: string): Promise<string> {
  const db = getDb();
  const taken = new Set(
    (
      await db
        .select({ pin: students.kioskPin })
        .from(students)
        .where(eq(students.schoolId, schoolId))
    )
      .map((r) => r.pin)
      .filter((p): p is string => Boolean(p)),
  );
  for (let n = 1000; n <= 9999; n++) {
    const candidate = String(n);
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error("Every PIN is taken — turn PIN check-in off or reuse codes");
}

export async function createStudent(input: {
  schoolId: string;
  familyId: string;
  firstName: string;
  lastName: string;
  birthdate?: Date | null;
  joinedOn?: Date | null;
  notes?: string;
  kioskPin?: string | null;
  actorId?: string;
}): Promise<Student> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName) throw new Error("The student needs a first name");
  const db = getDb();
  const [student] = await db
    .insert(students)
    .values({
      schoolId: input.schoolId,
      familyId: input.familyId,
      firstName,
      lastName: lastName || "—",
      birthdate: input.birthdate ?? null,
      joinedOn: input.joinedOn ?? new Date(),
      notes: input.notes?.trim() ?? "",
      kioskPin: input.kioskPin ?? (await nextKioskPin(input.schoolId)),
      status: "active",
    })
    .returning();
  return student;
}

/**
 * Enroll a student in a program at a rank. `promotedAt` is the time-in-rank clock
 * — an imported student keeps their real last-promotion date, which is what makes
 * their first grading event honest.
 */
export async function enrollStudent(input: {
  studentId: string;
  programId: string;
  rankId: string;
  currentStripes?: number;
  promotedAt?: Date;
}): Promise<Enrollment> {
  const db = getDb();
  const [enrollment] = await db
    .insert(enrollments)
    .values({
      studentId: input.studentId,
      programId: input.programId,
      currentRankId: input.rankId,
      currentStripes: input.currentStripes ?? 0,
      promotedAt: input.promotedAt ?? new Date(),
      status: "active",
    })
    .onConflictDoUpdate({
      target: [enrollments.studentId, enrollments.programId],
      set: {
        currentRankId: input.rankId,
        currentStripes: input.currentStripes ?? 0,
        promotedAt: input.promotedAt ?? new Date(),
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning();
  return enrollment;
}

export async function setStudentStatus(input: {
  schoolId: string;
  studentId: string;
  status: StudentStatus;
  actorId: string;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(students)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(students.id, input.studentId), eq(students.schoolId, input.schoolId)));
    // The enrollment clock stops with the student: a paused student's
    // days-in-rank must not keep accruing over the summer.
    await tx
      .update(enrollments)
      .set({
        status: input.status === "active" ? "active" : input.status === "paused" ? "paused" : "ended",
        pausedAt: input.status === "paused" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(enrollments.studentId, input.studentId));
  });
  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: `student.${input.status}`,
    target: input.studentId,
  });
}

export async function signOff(input: {
  schoolId: string;
  enrollmentId: string;
  actorId: string;
  clear?: boolean;
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.id, input.enrollmentId), eq(students.schoolId, input.schoolId)));
  if (!row) throw new Error("Enrollment not found");
  await db
    .update(enrollments)
    .set(
      input.clear
        ? { signoffAt: null, signoffBy: null, updatedAt: new Date() }
        : { signoffAt: new Date(), signoffBy: input.actorId, updatedAt: new Date() },
    )
    .where(eq(enrollments.id, input.enrollmentId));
  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: input.clear ? "enrollment.signoff_cleared" : "enrollment.signoff",
    target: input.enrollmentId,
  });
}

export async function updateStudentNotes(input: {
  schoolId: string;
  studentId: string;
  notes: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(students)
    .set({ notes: input.notes.trim().slice(0, 4000), updatedAt: new Date() })
    .where(and(eq(students.id, input.studentId), eq(students.schoolId, input.schoolId)));
}

// -------------------------------------------------------------------- read

export interface RosterEntry {
  studentId: string;
  name: string;
  status: StudentStatus;
  familyId: string;
  familyName: string;
  kioskPin: string | null;
  /** One row per program the student trains in. */
  programs: {
    enrollmentId: string;
    programId: string;
    programName: string;
    rankName: string;
    beltColorHex: string;
    stripesEarned: number;
    stripesTotal: number;
    progress: Progress;
  }[];
  cadenceLabel: string;
  flagged: boolean;
  billingState: "paid" | "past_due" | "paused" | "none";
}

/**
 * The roster screen's data, assembled in a fixed number of queries regardless of
 * how many students a school has.
 */
export async function loadRoster(input: {
  schoolId: string;
  timezone: string;
  programId?: string | null;
  search?: string;
  now?: Date;
  includeInactive?: boolean;
}): Promise<RosterEntry[]> {
  const db = getDb();
  const now = input.now ?? new Date();
  const asOfDay = dayKey(now, input.timezone);

  const studentRows = await db
    .select({ student: students, familyName: families.name })
    .from(students)
    .innerJoin(families, eq(families.id, students.familyId))
    .where(eq(students.schoolId, input.schoolId))
    .orderBy(asc(students.firstName), asc(students.lastName));

  const wanted = studentRows.filter((r) => {
    if (!input.includeInactive && r.student.status === "inactive") return false;
    if (input.search) {
      const needle = input.search.trim().toLowerCase();
      const haystack = `${r.student.firstName} ${r.student.lastName} ${r.familyName}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
  if (wanted.length === 0) return [];

  const studentIds = wanted.map((r) => r.student.id);

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
    .where(and(inArray(enrollments.studentId, studentIds), eq(programs.schoolId, input.schoolId)));

  const attendance = await db
    .select({ studentId: checkins.studentId, enrollmentId: checkins.enrollmentId, at: checkins.checkedInAt })
    .from(checkins)
    .where(inArray(checkins.studentId, studentIds));

  const flags = await db
    .select({ studentId: retentionFlags.studentId, status: retentionFlags.status })
    .from(retentionFlags)
    .where(
      and(
        inArray(retentionFlags.studentId, studentIds),
        inArray(retentionFlags.status, ["open", "contacted"]),
      ),
    );
  const flagged = new Set(flags.map((f) => f.studentId));

  const subs = await db
    .select({ subscription: subscriptions, familyId: families.id })
    .from(subscriptions)
    .innerJoin(families, eq(families.id, subscriptions.familyId))
    .where(eq(families.schoolId, input.schoolId));

  const twelveWeeksAgo = now.getTime() - 84 * 86_400_000;

  const entries: RosterEntry[] = [];
  for (const row of wanted) {
    const mine = enrolled.filter((e) => e.enrollment.studentId === row.student.id);
    if (input.programId && !mine.some((e) => e.programId === input.programId)) continue;

    const myCheckins = attendance.filter((a) => a.studentId === row.student.id);
    const recent = myCheckins.filter((a) => a.at.getTime() >= twelveWeeksAgo);
    const perWeek = recent.length / 12;
    const lastSeen = myCheckins.reduce<Date | null>(
      (best, a) => (best === null || a.at > best ? a.at : best),
      null,
    );

    const familySub = subs.find(
      (s) => s.familyId === row.student.familyId && s.subscription.status !== "canceled",
    );

    entries.push({
      studentId: row.student.id,
      name: `${row.student.firstName} ${row.student.lastName}`,
      status: row.student.status,
      familyId: row.student.familyId,
      familyName: row.familyName,
      kioskPin: row.student.kioskPin,
      programs: mine
        .filter((e) => !input.programId || e.programId === input.programId)
        .map((e) => {
          const since = myCheckins.filter(
            (a) => a.enrollmentId === e.enrollment.id && a.at >= e.enrollment.promotedAt,
          ).length;
          return {
            enrollmentId: e.enrollment.id,
            programId: e.programId,
            programName: e.programName,
            rankName: e.rank.name,
            beltColorHex: e.rank.beltColorHex,
            stripesEarned: e.enrollment.currentStripes,
            stripesTotal: e.rank.stripes,
            progress: computeProgress({
              rank: e.rank,
              currentStripes: e.enrollment.currentStripes,
              classesSince: since,
              promotedOn: dayKey(e.enrollment.promotedAt, input.timezone),
              asOfDay:
                e.enrollment.status === "paused" && e.enrollment.pausedAt
                  ? dayKey(e.enrollment.pausedAt, input.timezone)
                  : asOfDay,
              signoffDone: Boolean(e.enrollment.signoffAt),
            }),
          };
        }),
      cadenceLabel: cadencePhrase(perWeek, lastSeen, input.timezone, asOfDay),
      flagged: flagged.has(row.student.id),
      billingState: !familySub
        ? "none"
        : familySub.subscription.status === "past_due"
          ? "past_due"
          : familySub.subscription.status === "paused"
            ? "paused"
            : "paid",
    });
  }
  return entries;
}

function cadencePhrase(
  perWeek: number,
  lastSeen: Date | null,
  timezone: string,
  asOfDay: string,
): string {
  if (!lastSeen) return "no check-ins yet";
  const days = daysBetween(dayKey(lastSeen, timezone), asOfDay);
  const rounded = perWeek >= 1 ? Math.round(perWeek) : Math.round(perWeek * 10) / 10;
  const cadence = perWeek < 0.25 ? "occasional" : `${rounded}x/week`;
  const seen = days <= 0 ? "in today" : days === 1 ? "in yesterday" : `last seen ${days} days ago`;
  return `${cadence} · ${seen}`;
}

export interface StudentDetail {
  student: Student;
  family: Family;
  familySiblings: { id: string; name: string; status: StudentStatus }[];
  enrollments: {
    enrollment: Enrollment;
    programId: string;
    programName: string;
    rankName: string;
    beltColorHex: string;
    stripesEarned: number;
    stripesTotal: number;
    nextRankName: string | null;
    progress: Progress;
    signoffRequired: boolean;
  }[];
  /** 12 weekly buckets, oldest first — the attendance sparkline. */
  weeklyCheckins: number[];
  totalCheckins: number;
  lastSeen: Date | null;
  billing: {
    status: string;
    planName: string | null;
    amountCents: number | null;
    currentPeriodEnd: Date | null;
    pastDueSince: Date | null;
  } | null;
  openFlagId: string | null;
}

export async function loadStudent(input: {
  schoolId: string;
  studentId: string;
  timezone: string;
  now?: Date;
}): Promise<StudentDetail | null> {
  const db = getDb();
  const now = input.now ?? new Date();
  const asOfDay = dayKey(now, input.timezone);

  const [row] = await db
    .select({ student: students, family: families })
    .from(students)
    .innerJoin(families, eq(families.id, students.familyId))
    .where(and(eq(students.id, input.studentId), eq(students.schoolId, input.schoolId)));
  if (!row) return null;

  const siblings = await db
    .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, status: students.status })
    .from(students)
    .where(eq(students.familyId, row.family.id))
    .orderBy(asc(students.firstName));

  const enrolled = await db
    .select({ enrollment: enrollments, rank: ranks, programId: programs.id, programName: programs.name })
    .from(enrollments)
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(eq(enrollments.studentId, input.studentId));

  const ladders = new Map<string, { id: string; name: string; displayOrder: number }[]>();
  for (const programId of new Set(enrolled.map((e) => e.programId))) {
    ladders.set(
      programId,
      await db
        .select({ id: ranks.id, name: ranks.name, displayOrder: ranks.displayOrder })
        .from(ranks)
        .where(eq(ranks.programId, programId))
        .orderBy(asc(ranks.displayOrder)),
    );
  }

  const twelveWeeksAgo = startOfDay(
    new Date(now.getTime() - 84 * 86_400_000).toISOString().slice(0, 10),
    input.timezone,
  );
  const attendance = await db
    .select({ enrollmentId: checkins.enrollmentId, at: checkins.checkedInAt })
    .from(checkins)
    .where(eq(checkins.studentId, input.studentId))
    .orderBy(desc(checkins.checkedInAt));

  const weekly = new Array(12).fill(0) as number[];
  for (const c of attendance) {
    if (c.at < twelveWeeksAgo) continue;
    const weeksAgo = Math.floor((now.getTime() - c.at.getTime()) / (7 * 86_400_000));
    const bucket = 11 - Math.min(11, weeksAgo);
    weekly[bucket] += 1;
  }

  const [sub] = await db
    .select({ subscription: subscriptions, plan: membershipPlans })
    .from(subscriptions)
    .innerJoin(membershipPlans, eq(membershipPlans.id, subscriptions.membershipPlanId))
    .where(eq(subscriptions.familyId, row.family.id))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const [flag] = await db
    .select({ id: retentionFlags.id })
    .from(retentionFlags)
    .where(
      and(
        eq(retentionFlags.studentId, input.studentId),
        inArray(retentionFlags.status, ["open", "contacted"]),
      ),
    );

  return {
    student: row.student,
    family: row.family,
    familySiblings: siblings.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      status: s.status,
    })),
    enrollments: enrolled.map((e) => {
      const ladder = ladders.get(e.programId) ?? [];
      const idx = ladder.findIndex((r) => r.id === e.rank.id);
      const nextRankName = idx >= 0 && idx < ladder.length - 1 ? ladder[idx + 1].name : null;
      const since = attendance.filter(
        (a) => a.enrollmentId === e.enrollment.id && a.at >= e.enrollment.promotedAt,
      ).length;
      return {
        enrollment: e.enrollment,
        programId: e.programId,
        programName: e.programName,
        rankName: e.rank.name,
        beltColorHex: e.rank.beltColorHex,
        stripesEarned: e.enrollment.currentStripes,
        stripesTotal: e.rank.stripes,
        nextRankName,
        signoffRequired: e.rank.requiresSignoff,
        progress: computeProgress({
          rank: e.rank,
          currentStripes: e.enrollment.currentStripes,
          classesSince: since,
          promotedOn: dayKey(e.enrollment.promotedAt, input.timezone),
          asOfDay:
            e.enrollment.status === "paused" && e.enrollment.pausedAt
              ? dayKey(e.enrollment.pausedAt, input.timezone)
              : asOfDay,
          signoffDone: Boolean(e.enrollment.signoffAt),
          atTopOfLadder: nextRankName === null,
        }),
      };
    }),
    weeklyCheckins: weekly,
    totalCheckins: attendance.length,
    lastSeen: attendance[0]?.at ?? null,
    billing: sub
      ? {
          status: sub.subscription.status,
          planName: sub.plan.name,
          amountCents: sub.plan.amountCents,
          currentPeriodEnd: sub.subscription.currentPeriodEnd,
          pastDueSince: sub.subscription.pastDueSince,
        }
      : null,
    openFlagId: flag?.id ?? null,
  };
}

/** "142 check-ins · 7 flagged · 3 gradings ready" — the roster's hero stat. */
export async function rosterSummary(input: {
  schoolId: string;
  timezone: string;
  now?: Date;
}): Promise<{
  checkinsThisWeek: number;
  activeStudents: number;
  openFlags: number;
  readyToGrade: number;
}> {
  const db = getDb();
  const now = input.now ?? new Date();
  const today = dayKey(now, input.timezone);
  // The dojo's week starts Monday — a school's "this week" is its class week.
  const parts = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = parts === 0 ? -6 : 1 - parts;
  const weekStart = startOfDay(
    new Date(Date.parse(`${today}T00:00:00Z`) + mondayOffset * 86_400_000)
      .toISOString()
      .slice(0, 10),
    input.timezone,
  );

  const [checkinRow] = await db
    .select({ n: count() })
    .from(checkins)
    .innerJoin(students, eq(students.id, checkins.studentId))
    .where(and(eq(students.schoolId, input.schoolId), gte(checkins.checkedInAt, weekStart)));

  const [activeRow] = await db
    .select({ n: count() })
    .from(students)
    .where(and(eq(students.schoolId, input.schoolId), eq(students.status, "active")));

  const [flagRow] = await db
    .select({ n: count() })
    .from(retentionFlags)
    .innerJoin(students, eq(students.id, retentionFlags.studentId))
    .where(
      and(
        eq(students.schoolId, input.schoolId),
        inArray(retentionFlags.status, ["open", "contacted"]),
      ),
    );

  const programRows = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.schoolId, input.schoolId), eq(programs.status, "active")));
  const { progressForPrograms } = await import("@/lib/progression");
  const all = await progressForPrograms(
    programRows.map((p) => p.id),
    { timezone: input.timezone, now },
  );

  return {
    checkinsThisWeek: Number(checkinRow?.n ?? 0),
    activeStudents: Number(activeRow?.n ?? 0),
    openFlags: Number(flagRow?.n ?? 0),
    readyToGrade: all.filter((a) => a.progress.eligible).length,
  };
}

export async function activeStudentCount(schoolId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(students)
    .where(and(eq(students.schoolId, schoolId), eq(students.status, "active")));
  return Number(row?.n ?? 0);
}

// ------------------------------------------------------------------ import

export interface ImportSummary {
  studentsCreated: number;
  familiesCreated: number;
  enrollmentsCreated: number;
  skipped: { line: number; message: string }[];
  unmatchedRanks: string[];
}

/**
 * Import a roster. Families are keyed by name so three siblings collapse into one
 * household with one guardian email — the thing incumbents get wrong and bill
 * three times for.
 *
 * Ranks are matched loosely by name against the target program's ladder ("blue",
 * "Blue Belt", "blue belt" all hit "Blue belt"); an unmatched rank places the
 * student at the bottom of the ladder and is reported, because guessing a rank
 * wrong is worse than saying so.
 */
export async function importStudents(input: {
  schoolId: string;
  csv: string;
  defaultProgramId: string;
  actorId: string;
}): Promise<ImportSummary> {
  const parsed = parseStudentCsv(input.csv);
  const db = getDb();

  const programRows = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(eq(programs.schoolId, input.schoolId));
  if (programRows.length === 0) throw new Error("Create a program before importing students");

  const ladders = new Map<string, { id: string; name: string; displayOrder: number; stripes: number }[]>();
  for (const program of programRows) {
    ladders.set(
      program.id,
      await db
        .select({ id: ranks.id, name: ranks.name, displayOrder: ranks.displayOrder, stripes: ranks.stripes })
        .from(ranks)
        .where(eq(ranks.programId, program.id))
        .orderBy(asc(ranks.displayOrder)),
    );
  }
  if ((ladders.get(input.defaultProgramId) ?? []).length === 0) {
    throw new Error("That program has no rank ladder yet — load a curriculum template first");
  }

  const existingFamilies = await db
    .select({ id: families.id, name: families.name })
    .from(families)
    .where(eq(families.schoolId, input.schoolId));
  const familyByName = new Map(existingFamilies.map((f) => [f.name.toLowerCase(), f.id]));

  const existingStudents = await db
    .select({ firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(eq(students.schoolId, input.schoolId));
  const seen = new Set(
    existingStudents.map((s) => `${s.firstName.toLowerCase()}|${s.lastName.toLowerCase()}`),
  );

  const takenPins = new Set(
    (
      await db.select({ pin: students.kioskPin }).from(students).where(eq(students.schoolId, input.schoolId))
    )
      .map((r) => r.pin)
      .filter((p): p is string => Boolean(p)),
  );
  let pinCursor = 1000;
  const claimPin = (preferred: string | null): string => {
    if (preferred && !takenPins.has(preferred)) {
      takenPins.add(preferred);
      return preferred;
    }
    while (takenPins.has(String(pinCursor))) pinCursor += 1;
    const pin = String(pinCursor);
    takenPins.add(pin);
    return pin;
  };

  const summary: ImportSummary = {
    studentsCreated: 0,
    familiesCreated: 0,
    enrollmentsCreated: 0,
    skipped: [...parsed.problems],
    unmatchedRanks: [],
  };

  for (const row of parsed.rows) {
    const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}`;
    if (seen.has(key)) {
      summary.skipped.push({ line: row.line, message: `${row.firstName} ${row.lastName} is already on the roster` });
      continue;
    }

    const familyKey = row.familyName.toLowerCase();
    let familyId = familyByName.get(familyKey);
    if (!familyId) {
      const family = await createFamily({
        schoolId: input.schoolId,
        name: row.familyName,
        email: row.guardianEmail,
        phone: row.guardianPhone,
      });
      familyId = family.id;
      familyByName.set(familyKey, familyId);
      summary.familiesCreated += 1;
    } else if (row.guardianEmail) {
      // Fill in a guardian address the first time one appears for the household.
      await db
        .update(families)
        .set({ email: row.guardianEmail, updatedAt: new Date() })
        .where(and(eq(families.id, familyId), isNull(families.email)));
    }

    const student = await createStudent({
      schoolId: input.schoolId,
      familyId,
      firstName: row.firstName,
      lastName: row.lastName,
      birthdate: row.birthdate ? new Date(`${row.birthdate}T12:00:00Z`) : null,
      joinedOn: row.joinedOn ? new Date(`${row.joinedOn}T12:00:00Z`) : new Date(),
      notes: row.notes,
      kioskPin: claimPin(row.pin),
    });
    seen.add(key);
    summary.studentsCreated += 1;

    const programId = row.program
      ? (programRows.find((p) => p.name.toLowerCase() === row.program!.toLowerCase())?.id ??
        input.defaultProgramId)
      : input.defaultProgramId;
    const ladder = ladders.get(programId) ?? ladders.get(input.defaultProgramId) ?? [];
    const rank = matchRank(ladder, row.rank);
    if (row.rank && !rank.matched && !summary.unmatchedRanks.includes(row.rank)) {
      summary.unmatchedRanks.push(row.rank);
    }

    await enrollStudent({
      studentId: student.id,
      programId,
      rankId: rank.rank.id,
      currentStripes: Math.min(row.stripes, rank.rank.stripes),
      promotedAt: row.promotedOn
        ? new Date(`${row.promotedOn}T12:00:00Z`)
        : (student.joinedOn ?? new Date()),
    });
    summary.enrollmentsCreated += 1;
  }

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "roster.imported",
    target: input.defaultProgramId,
    metadata: {
      students: summary.studentsCreated,
      families: summary.familiesCreated,
      skipped: summary.skipped.length,
    },
  });

  return summary;
}

/** Loose rank matching: "blue", "Blue Belt", "blue belt" all find "Blue belt". */
export function matchRank<T extends { id: string; name: string; stripes: number }>(
  ladder: T[],
  raw: string | null,
): { rank: T; matched: boolean } {
  const bottom = ladder[0];
  if (!raw) return { rank: bottom, matched: false };
  const needle = raw.toLowerCase().replace(/belt|kyu|dan|gup|\s|-|—/g, "");
  const exact = ladder.find((r) => r.name.toLowerCase() === raw.toLowerCase());
  if (exact) return { rank: exact, matched: true };
  const loose = ladder.find(
    (r) => r.name.toLowerCase().replace(/belt|kyu|dan|gup|\s|-|—/g, "") === needle,
  );
  if (loose) return { rank: loose, matched: true };
  const contains = ladder.find((r) => {
    const name = r.name.toLowerCase();
    return needle.length >= 3 && (name.includes(needle) || needle.includes(name.replace(/\s.*/, "")));
  });
  if (contains) return { rank: contains, matched: true };
  return { rank: bottom, matched: false };
}
