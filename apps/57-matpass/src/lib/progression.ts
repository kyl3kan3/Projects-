/**
 * src/lib/progression.ts
 *
 * The progression engine: classes-since-promotion, days-in-rank, sign-off state
 * -> eligibility. The product's core query, and the thing every other screen
 * reads from.
 *
 * ## The step model
 *
 * A rank carries requirements for the whole rank (`min_classes`,
 * `min_days_in_rank`) and a number of stripe steps within it (`stripes`). A
 * student therefore climbs `stripes + 1` steps to leave a rank: one per stripe,
 * then the rank promotion itself. Because `enrollments.promoted_at` resets on
 * every promotion — stripe awards included — each step is measured from the last
 * one, and each step's share of the rank requirement is
 *
 *     ceil(min_classes / (stripes + 1))   and   ceil(min_days / (stripes + 1))
 *
 * A BJJ blue belt at 4 stripes and 100 classes wants ~20 classes per stripe; a
 * kids' rank with 0 stripes wants the whole 24 in one go. Whichever step is next,
 * the belt bar shows that step's numbers, which is what the mono "18 / 24" means.
 *
 * ## The paused clock
 *
 * A paused enrollment stops accruing days: the clock runs to `paused_at` instead
 * of to now. Otherwise a student who pauses for the summer comes back
 * "eligible" on time served in the parking lot.
 */

import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkins,
  enrollments,
  gradingCandidates,
  programs,
  ranks,
  schools,
  students,
  type EligibilitySnapshot,
  type Enrollment,
  type Rank,
} from "@/db/schema";
import { dayKey, daysBetween } from "@/lib/time";

/** What the enrollment is working toward right now. */
export type StepKind = "stripe" | "rank" | "top";

export interface ProgressInput {
  /** The rank the student currently holds. */
  rank: Pick<Rank, "name" | "stripes" | "minClasses" | "minDaysInRank" | "requiresSignoff">;
  currentStripes: number;
  /** Classes attended since `promotedAt`. */
  classesSince: number;
  /** School-local day of the last promotion. */
  promotedOn: string;
  /** School-local day the calculation is "as of". */
  asOfDay: string;
  signoffDone: boolean;
  /** True when there is no higher rank in the ladder. */
  atTopOfLadder?: boolean;
}

export interface Progress extends EligibilitySnapshot {
  step: StepKind;
  /** Human label of what is next: "2nd stripe" or "Blue belt". */
  eligible: boolean;
  /** 0..1 — the crimson progress hairline. */
  fraction: number;
}

function stepShare(total: number, steps: number): number {
  if (steps <= 1) return total;
  return Math.ceil(total / steps);
}

/**
 * The whole engine, as one pure function. Everything else in this module exists
 * only to feed it rows.
 */
export function computeProgress(input: ProgressInput): Progress {
  const { rank, currentStripes, classesSince, promotedOn, asOfDay, signoffDone } = input;
  const steps = Math.max(1, rank.stripes + 1);
  const nextIsStripe = currentStripes < rank.stripes;
  const step: StepKind = input.atTopOfLadder && !nextIsStripe ? "top" : nextIsStripe ? "stripe" : "rank";

  const classesRequired = stepShare(rank.minClasses, steps);
  const daysRequired = stepShare(rank.minDaysInRank, steps);
  const daysDone = Math.max(0, daysBetween(promotedOn, asOfDay));
  const signoffRequired = rank.requiresSignoff && step === "rank";

  const missing: string[] = [];
  const classesShort = Math.max(0, classesRequired - classesSince);
  const daysShort = Math.max(0, daysRequired - daysDone);
  if (classesShort > 0) {
    missing.push(`${classesShort} ${classesShort === 1 ? "class" : "classes"} short`);
  }
  if (daysShort > 0) missing.push(`${daysShort} ${daysShort === 1 ? "day" : "days"} short`);
  if (signoffRequired && !signoffDone) missing.push("needs instructor sign-off");
  if (step === "top") missing.push("top of the ladder");

  // The bar tracks the binding requirement — the one furthest from being met —
  // so it never reads 100% while something is still outstanding.
  const classFraction = classesRequired === 0 ? 1 : Math.min(1, classesSince / classesRequired);
  const dayFraction = daysRequired === 0 ? 1 : Math.min(1, daysDone / daysRequired);

  return {
    step,
    classesDone: classesSince,
    classesRequired,
    daysDone,
    daysRequired,
    signoffRequired,
    signoffDone: signoffRequired ? signoffDone : true,
    missing,
    eligible: missing.length === 0,
    fraction: Math.min(classFraction, dayFraction),
  };
}

/** "2nd stripe" / "Blue belt" — what the ledger line and the pill both say. */
export function stepLabel(
  step: StepKind,
  currentStripes: number,
  nextRankName: string | null,
): string {
  if (step === "top") return "Top of the ladder";
  if (step === "stripe") return `${ordinal(currentStripes + 1)} stripe`;
  return nextRankName ?? "Next rank";
}

export function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

// ---------------------------------------------------------------- db layer

export interface EnrollmentProgress {
  enrollment: Enrollment;
  rank: Rank;
  nextRank: Rank | null;
  progress: Progress;
  studentName: string;
  studentId: string;
  programName: string;
}

/**
 * Count check-ins for an enrollment since its current rank clock started. Uses
 * the typed `gte` operator, not a raw fragment — a Date inside a raw `sql`
 * template skips Drizzle's encoder and blows up inside postgres.js.
 */
async function classesSinceFor(enrollmentId: string, since: Date): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(checkins)
    .where(and(eq(checkins.enrollmentId, enrollmentId), gte(checkins.checkedInAt, since)));
  return Number(row?.n ?? 0);
}

async function ladderFor(programId: string): Promise<Rank[]> {
  const db = getDb();
  return db.select().from(ranks).where(eq(ranks.programId, programId)).orderBy(asc(ranks.displayOrder));
}

/** The as-of instant for an enrollment: now, unless the clock is paused. */
function asOfFor(enrollment: Enrollment, now: Date): Date {
  const paused = enrollment.status === "paused" && enrollment.pausedAt;
  return paused ? enrollment.pausedAt! : now;
}

export async function progressFor(
  enrollmentId: string,
  now = new Date(),
): Promise<EligibilitySnapshot & { step: StepKind; fraction: number; eligible: boolean }> {
  const db = getDb();
  const [row] = await db
    .select({
      enrollment: enrollments,
      rank: ranks,
      timezone: schools.timezone,
    })
    .from(enrollments)
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(eq(enrollments.id, enrollmentId));
  if (!row) throw new Error("Enrollment not found");

  const tz = row.timezone;
  const ladder = await ladderFor(row.enrollment.programId);
  const idx = ladder.findIndex((r) => r.id === row.rank.id);
  const asOf = asOfFor(row.enrollment, now);
  const classesSince = await classesSinceFor(enrollmentId, row.enrollment.promotedAt);

  return computeProgress({
    rank: row.rank,
    currentStripes: row.enrollment.currentStripes,
    classesSince,
    promotedOn: dayKey(row.enrollment.promotedAt, tz),
    asOfDay: dayKey(asOf, tz),
    signoffDone: Boolean(row.enrollment.signoffAt),
    atTopOfLadder: idx >= 0 && idx === ladder.length - 1,
  });
}

export async function timezoneForProgram(programId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ tz: schools.timezone })
    .from(programs)
    .innerJoin(schools, eq(schools.id, programs.schoolId))
    .where(eq(programs.id, programId));
  return rows[0]?.tz ?? "America/Chicago";
}

/**
 * Progress for every active enrollment in a set of programs — one query for the
 * check-in ledger rather than N, because the grading list and the roster both
 * need this for the whole school at once.
 */
export async function progressForPrograms(
  programIds: string[],
  options: { now?: Date; timezone: string; includePaused?: boolean } = { timezone: "America/Chicago" },
): Promise<EnrollmentProgress[]> {
  if (programIds.length === 0) return [];
  const db = getDb();
  const now = options.now ?? new Date();

  const rows = await db
    .select({
      enrollment: enrollments,
      rank: ranks,
      studentFirst: students.firstName,
      studentLast: students.lastName,
      studentId: students.id,
      programId: programs.id,
      programName: programs.name,
    })
    .from(enrollments)
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(inArray(enrollments.programId, programIds));

  const wanted = rows.filter((r) =>
    options.includePaused ? r.enrollment.status !== "ended" : r.enrollment.status === "active",
  );
  if (wanted.length === 0) return [];

  // Check-in counts for all of them in one pass: fetch the rows once, bucket in
  // memory. A school has thousands of check-ins, not millions.
  const counts = await countsByEnrollment(wanted.map((r) => ({
    id: r.enrollment.id,
    since: r.enrollment.promotedAt,
  })));

  const ladders = new Map<string, Rank[]>();
  for (const programId of new Set(wanted.map((r) => r.programId))) {
    ladders.set(programId, await ladderFor(programId));
  }

  return wanted.map((r) => {
    const ladder = ladders.get(r.programId) ?? [];
    const idx = ladder.findIndex((x) => x.id === r.rank.id);
    const nextRank = idx >= 0 && idx < ladder.length - 1 ? ladder[idx + 1] : null;
    const asOf = asOfFor(r.enrollment, now);
    const progress = computeProgress({
      rank: r.rank,
      currentStripes: r.enrollment.currentStripes,
      classesSince: counts.get(r.enrollment.id) ?? 0,
      promotedOn: dayKey(r.enrollment.promotedAt, options.timezone),
      asOfDay: dayKey(asOf, options.timezone),
      signoffDone: Boolean(r.enrollment.signoffAt),
      atTopOfLadder: nextRank === null,
    });
    return {
      enrollment: r.enrollment,
      rank: r.rank,
      nextRank,
      progress,
      studentId: r.studentId,
      studentName: `${r.studentFirst} ${r.studentLast}`,
      programName: r.programName,
    };
  });
}

async function countsByEnrollment(
  wanted: { id: string; since: Date }[],
): Promise<Map<string, number>> {
  const db = getDb();
  const ids = wanted.map((w) => w.id);
  const sinceById = new Map(wanted.map((w) => [w.id, w.since.getTime()]));
  const rows = await db
    .select({ enrollmentId: checkins.enrollmentId, at: checkins.checkedInAt })
    .from(checkins)
    .where(inArray(checkins.enrollmentId, ids));
  const out = new Map<string, number>();
  for (const row of rows) {
    const since = sinceById.get(row.enrollmentId);
    if (since === undefined || row.at.getTime() < since) continue;
    out.set(row.enrollmentId, (out.get(row.enrollmentId) ?? 0) + 1);
  }
  return out;
}

/**
 * Nightly drift guard: recompute the eligibility snapshot stored on every open
 * grading candidate, so a list assembled a week ago still reads true on event
 * day. Incremental progress is computed on read everywhere else — nothing in the
 * product renders a stored progress column (a stale "ELIGIBLE" pill on a student
 * who has not trained since is exactly the bug this product exists to prevent).
 */
export async function refreshEligibility(
  schoolId: string,
  now = new Date(),
): Promise<{ enrollmentsUpdated: number }> {
  const db = getDb();
  const rows = await db
    .select({
      candidateId: gradingCandidates.id,
      status: gradingCandidates.status,
      enrollmentId: gradingCandidates.enrollmentId,
      programId: enrollments.programId,
    })
    .from(gradingCandidates)
    .innerJoin(enrollments, eq(enrollments.id, gradingCandidates.enrollmentId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(and(eq(programs.schoolId, schoolId), inArray(gradingCandidates.status, ["eligible", "near_miss", "invited", "confirmed"])));

  let updated = 0;
  for (const row of rows) {
    const snapshot = await progressFor(row.enrollmentId, now);
    const next =
      row.status === "invited" || row.status === "confirmed"
        ? row.status
        : snapshot.eligible
          ? "eligible"
          : "near_miss";
    await db
      .update(gradingCandidates)
      .set({
        eligibility: {
          classesDone: snapshot.classesDone,
          classesRequired: snapshot.classesRequired,
          daysDone: snapshot.daysDone,
          daysRequired: snapshot.daysRequired,
          signoffRequired: snapshot.signoffRequired,
          signoffDone: snapshot.signoffDone,
          missing: snapshot.missing,
        },
        status: next,
        updatedAt: new Date(),
      })
      .where(eq(gradingCandidates.id, row.candidateId));
    updated += 1;
  }
  return { enrollmentsUpdated: updated };
}
