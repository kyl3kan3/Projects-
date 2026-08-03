/**
 * src/lib/gradings.ts
 *
 * Grading events: the self-assembling candidate list, the event-day flow, and
 * the append-only promotion write.
 *
 * ## The append-only invariant
 *
 * `promotions` is a permanent record with grader attribution. Nothing in this
 * module — or anywhere in the app — updates or deletes a promotions row. A
 * mistake is corrected by appending a reversal (to -> from, carrying the reason)
 * and then, if appropriate, appending the corrected promotion. The student's
 * timeline therefore shows what actually happened, including the correction,
 * which is the whole point of a record a parent or a federation can trust.
 *
 * `promotions.test.ts` reads this file's source and fails if `update(promotions)`
 * or `delete(promotions)` ever appears in it, and separately proves through the
 * database that a reversal adds a row rather than changing one.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  enrollments,
  families,
  gradingCandidates,
  gradingEvents,
  programs,
  promotions,
  ranks,
  schools,
  students,
  users,
  type CandidateStatus,
  type EligibilitySnapshot,
  type GradingEvent,
  type Rank,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { progressForPrograms, stepLabel, type StepKind } from "@/lib/progression";
import { dayKey, formatDay } from "@/lib/time";

export interface CandidateView {
  candidateId: string;
  enrollmentId: string;
  studentId: string;
  studentName: string;
  programName: string;
  rankName: string;
  beltColorHex: string;
  stripesEarned: number;
  stripesTotal: number;
  nextLabel: string;
  step: StepKind;
  eligibility: EligibilitySnapshot;
  status: CandidateStatus;
  familyEmail: string | null;
  familyName: string;
}

// ------------------------------------------------------------ assembling

/**
 * The list assembles itself. Every active enrollment in the event's programs is
 * measured, and both sides are recorded: eligible, and near-miss with the exact
 * deltas ("2 classes short", "11 days short"). The near-miss list is the coaching
 * tool — it is not a filtered-out remainder.
 *
 * Re-running this after more classes have been logged moves people between the
 * two lists without disturbing anybody already invited, confirmed or promoted.
 */
export async function assembleCandidates(
  gradingEventId: string,
  options: { now?: Date; nearMissWindow?: number } = {},
): Promise<{ eligible: number; nearMiss: number }> {
  const db = getDb();
  const event = await loadEvent(gradingEventId);
  if (!event) throw new Error("Grading event not found");
  if (event.status === "completed") throw new Error("That grading event is already completed");
  const timezone = await schoolTimezone(event.schoolId);
  const now = options.now ?? new Date();

  const rows = await progressForPrograms(event.programIds, { timezone, now });
  const existing = await db
    .select()
    .from(gradingCandidates)
    .where(eq(gradingCandidates.gradingEventId, gradingEventId));
  const byEnrollment = new Map(existing.map((c) => [c.enrollmentId, c]));

  // A near miss is close enough to matter: within this many classes, or this
  // many weeks of time-in-rank. Someone 60 classes out is not a candidate, they
  // are a student.
  const window = options.nearMissWindow ?? 5;

  let eligible = 0;
  let nearMiss = 0;

  for (const row of rows) {
    const snapshot: EligibilitySnapshot = {
      classesDone: row.progress.classesDone,
      classesRequired: row.progress.classesRequired,
      daysDone: row.progress.daysDone,
      daysRequired: row.progress.daysRequired,
      signoffRequired: row.progress.signoffRequired,
      signoffDone: row.progress.signoffDone,
      missing: row.progress.missing,
    };
    const isEligible = row.progress.eligible;
    const classesShort = Math.max(0, snapshot.classesRequired - snapshot.classesDone);
    const daysShort = Math.max(0, snapshot.daysRequired - snapshot.daysDone);
    const isNearMiss =
      !isEligible && row.progress.step !== "top" && classesShort <= window && daysShort <= window * 7;

    const current = byEnrollment.get(row.enrollment.id);
    if (!isEligible && !isNearMiss) {
      // Someone who has slipped out of contention comes off the list — unless
      // they have already been invited or graded, which is never undone quietly.
      if (current && (current.status === "eligible" || current.status === "near_miss")) {
        await db.delete(gradingCandidates).where(eq(gradingCandidates.id, current.id));
      }
      continue;
    }

    if (isEligible) eligible += 1;
    else nearMiss += 1;

    if (current) {
      const sticky: CandidateStatus[] = ["invited", "confirmed", "promoted", "held_back", "no_show"];
      await db
        .update(gradingCandidates)
        .set({
          eligibility: snapshot,
          status: sticky.includes(current.status)
            ? current.status
            : isEligible
              ? "eligible"
              : "near_miss",
          updatedAt: new Date(),
        })
        .where(eq(gradingCandidates.id, current.id));
    } else {
      await db
        .insert(gradingCandidates)
        .values({
          gradingEventId,
          enrollmentId: row.enrollment.id,
          eligibility: snapshot,
          status: isEligible ? "eligible" : "near_miss",
        })
        .onConflictDoNothing({
          target: [gradingCandidates.gradingEventId, gradingCandidates.enrollmentId],
        });
    }
  }

  return { eligible, nearMiss };
}

export async function loadEvent(gradingEventId: string): Promise<GradingEvent | null> {
  const db = getDb();
  const [event] = await db.select().from(gradingEvents).where(eq(gradingEvents.id, gradingEventId));
  return event ?? null;
}

async function schoolTimezone(schoolId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ tz: schools.timezone })
    .from(schools)
    .where(eq(schools.id, schoolId));
  return row?.tz ?? "America/Chicago";
}

async function ladderFor(programId: string): Promise<Rank[]> {
  const db = getDb();
  return db
    .select()
    .from(ranks)
    .where(eq(ranks.programId, programId))
    .orderBy(asc(ranks.displayOrder));
}

/** Candidates with everything a row needs to render. */
export async function listCandidates(gradingEventId: string): Promise<CandidateView[]> {
  const db = getDb();
  const rows = await db
    .select({
      candidate: gradingCandidates,
      enrollment: enrollments,
      rank: ranks,
      studentId: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      programName: programs.name,
      programId: programs.id,
      familyEmail: families.email,
      familyName: families.name,
    })
    .from(gradingCandidates)
    .innerJoin(enrollments, eq(enrollments.id, gradingCandidates.enrollmentId))
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(families, eq(families.id, students.familyId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(eq(gradingCandidates.gradingEventId, gradingEventId))
    .orderBy(asc(students.firstName), asc(students.lastName));

  const ladders = new Map<string, Rank[]>();
  for (const programId of new Set(rows.map((r) => r.programId))) {
    ladders.set(programId, await ladderFor(programId));
  }

  return rows.map((r) => {
    const ladder = ladders.get(r.programId) ?? [];
    const target = nextStep(r.rank, r.enrollment.currentStripes, ladder);
    const step: StepKind = target?.step ?? "top";
    return {
      candidateId: r.candidate.id,
      enrollmentId: r.enrollment.id,
      studentId: r.studentId,
      studentName: `${r.firstName} ${r.lastName}`,
      programName: r.programName,
      rankName: r.rank.name,
      beltColorHex: r.rank.beltColorHex,
      stripesEarned: r.enrollment.currentStripes,
      stripesTotal: r.rank.stripes,
      nextLabel: stepLabel(step, r.enrollment.currentStripes, target?.rank.name ?? null),
      step,
      eligibility: r.candidate.eligibility,
      status: r.candidate.status,
      familyEmail: r.familyEmail,
      familyName: r.familyName,
    };
  });
}

// ------------------------------------------------------------- invitations

export async function inviteCandidates(input: {
  gradingEventId: string;
  schoolId: string;
  schoolName: string;
  actorId: string;
  candidateIds?: string[];
}): Promise<{ invited: number; emailed: number; noEmail: number }> {
  const db = getDb();
  const event = await loadEvent(input.gradingEventId);
  if (!event || event.schoolId !== input.schoolId) throw new Error("Grading event not found");
  const timezone = await schoolTimezone(input.schoolId);

  const all = await listCandidates(input.gradingEventId);
  const wanted = all.filter(
    (c) =>
      (c.status === "eligible" || c.status === "near_miss") &&
      (input.candidateIds ? input.candidateIds.includes(c.candidateId) : c.status === "eligible"),
  );
  if (wanted.length === 0) throw new Error("Nobody on this list is waiting to be invited");

  let emailed = 0;
  let noEmail = 0;
  const held = formatDay(dayKey(event.heldOn, timezone));

  for (const candidate of wanted) {
    await db
      .update(gradingCandidates)
      .set({ status: "invited", updatedAt: new Date() })
      .where(eq(gradingCandidates.id, candidate.candidateId));

    if (!candidate.familyEmail) {
      noEmail += 1;
      continue;
    }
    const result = await sendEmail({
      to: candidate.familyEmail,
      subject: `${candidate.studentName} is invited to ${event.name}`,
      text: [
        `${candidate.studentName} is invited to grade for their ${candidate.nextLabel.toLowerCase()} at ${event.name} on ${held}.`,
        "",
        `Current rank: ${candidate.rankName}${
          candidate.stripesEarned > 0
            ? ` · ${candidate.stripesEarned} stripe${candidate.stripesEarned === 1 ? "" : "s"}`
            : ""
        }`,
        `Classes since last promotion: ${candidate.eligibility.classesDone} / ${candidate.eligibility.classesRequired}`,
        `Days in rank: ${candidate.eligibility.daysDone} / ${candidate.eligibility.daysRequired}`,
        "",
        "Reply to this email or tell the front desk to confirm attendance.",
        "",
        `— ${input.schoolName}`,
      ].join("\n"),
    });
    if (result.ok) emailed += 1;
    else noEmail += 1;
  }

  if (event.status === "draft") {
    await db
      .update(gradingEvents)
      .set({ status: "inviting", updatedAt: new Date() })
      .where(eq(gradingEvents.id, input.gradingEventId));
  }

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "grading.invited",
    target: input.gradingEventId,
    metadata: { invited: wanted.length, emailed, noEmail },
  });

  return { invited: wanted.length, emailed, noEmail };
}

export async function setCandidateStatus(input: {
  candidateId: string;
  gradingEventId: string;
  status: CandidateStatus;
}): Promise<void> {
  const db = getDb();
  await db
    .update(gradingCandidates)
    .set({ status: input.status, updatedAt: new Date() })
    .where(
      and(
        eq(gradingCandidates.id, input.candidateId),
        eq(gradingCandidates.gradingEventId, input.gradingEventId),
      ),
    );
}

// -------------------------------------------------------------- promoting

/** One step up the ladder: the next stripe, or the next rank at zero stripes. */
export function nextStep(
  rank: Rank,
  currentStripes: number,
  ladder: Rank[],
): { rank: Rank; stripes: number; step: StepKind } | null {
  if (currentStripes < rank.stripes) {
    return { rank, stripes: currentStripes + 1, step: "stripe" };
  }
  const idx = ladder.findIndex((r) => r.id === rank.id);
  const next = idx >= 0 ? ladder[idx + 1] : undefined;
  if (!next) return null;
  return { rank: next, stripes: 0, step: "rank" };
}

export interface PromotionPreview {
  candidateId: string | null;
  enrollmentId: string;
  studentName: string;
  fromRankId: string;
  fromRankName: string;
  fromBeltColorHex: string;
  fromStripes: number;
  fromStripesTotal: number;
  toRankId: string;
  toRankName: string;
  toBeltColorHex: string;
  toStripes: number;
  toStripesTotal: number;
  step: StepKind;
}

/**
 * What completing the event would write: "14 promotions — review before
 * recording". Computed from the live enrollment rows, not from anything the
 * browser posted back, and recomputed inside `completeEvent`'s transaction.
 */
export async function previewPromotions(
  gradingEventId: string,
  candidateIds: string[],
): Promise<PromotionPreview[]> {
  if (candidateIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      candidateId: gradingCandidates.id,
      enrollment: enrollments,
      rank: ranks,
      firstName: students.firstName,
      lastName: students.lastName,
      programId: programs.id,
    })
    .from(gradingCandidates)
    .innerJoin(enrollments, eq(enrollments.id, gradingCandidates.enrollmentId))
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(
      and(
        eq(gradingCandidates.gradingEventId, gradingEventId),
        inArray(gradingCandidates.id, candidateIds),
      ),
    )
    .orderBy(asc(students.firstName), asc(students.lastName));

  const ladders = new Map<string, Rank[]>();
  for (const programId of new Set(rows.map((r) => r.programId))) {
    ladders.set(programId, await ladderFor(programId));
  }

  const previews: PromotionPreview[] = [];
  for (const r of rows) {
    const ladder = ladders.get(r.programId) ?? [];
    const target = nextStep(r.rank, r.enrollment.currentStripes, ladder);
    if (!target) continue; // top of the ladder: nothing to write
    previews.push({
      candidateId: r.candidateId,
      enrollmentId: r.enrollment.id,
      studentName: `${r.firstName} ${r.lastName}`,
      fromRankId: r.rank.id,
      fromRankName: r.rank.name,
      fromBeltColorHex: r.rank.beltColorHex,
      fromStripes: r.enrollment.currentStripes,
      fromStripesTotal: r.rank.stripes,
      toRankId: target.rank.id,
      toRankName: target.rank.name,
      toBeltColorHex: target.rank.beltColorHex,
      toStripes: target.stripes,
      toStripesTotal: target.rank.stripes,
      step: target.step,
    });
  }
  return previews;
}

export interface Decision {
  candidateId: string;
  decision: "promote" | "hold_back" | "no_show";
}

/**
 * Complete the event behind the review screen. Every promotion is appended with
 * grader attribution and the event id; the enrollment's rank state and its
 * time-in-rank clock reset in the same transaction. Held-back and no-show
 * candidates are recorded without a promotion.
 */
export async function completeEvent(input: {
  gradingEventId: string;
  schoolId: string;
  gradedBy: string;
  decisions: Decision[];
  promotedOn?: Date;
}): Promise<{ promotions: number; heldBack: number; noShows: number }> {
  const db = getDb();
  const event = await loadEvent(input.gradingEventId);
  if (!event || event.schoolId !== input.schoolId) throw new Error("Grading event not found");
  if (event.status === "completed") throw new Error("That grading event is already completed");

  const promoteIds = input.decisions
    .filter((d) => d.decision === "promote")
    .map((d) => d.candidateId);
  const previews = await previewPromotions(input.gradingEventId, promoteIds);
  const promotedOn = input.promotedOn ?? new Date();

  let heldBack = 0;
  let noShows = 0;

  await db.transaction(async (tx) => {
    for (const preview of previews) {
      // Append-only: a new row, never an edit of an old one.
      await tx.insert(promotions).values({
        enrollmentId: preview.enrollmentId,
        fromRankId: preview.fromRankId,
        fromStripes: preview.fromStripes,
        toRankId: preview.toRankId,
        toStripes: preview.toStripes,
        promotedOn,
        gradingEventId: input.gradingEventId,
        gradedBy: input.gradedBy,
        note: "",
      });
      await tx
        .update(enrollments)
        .set({
          currentRankId: preview.toRankId,
          currentStripes: preview.toStripes,
          promotedAt: promotedOn,
          // A fresh rank needs a fresh sign-off.
          signoffAt: null,
          signoffBy: null,
          updatedAt: new Date(),
        })
        .where(eq(enrollments.id, preview.enrollmentId));
      if (preview.candidateId) {
        await tx
          .update(gradingCandidates)
          .set({ status: "promoted", updatedAt: new Date() })
          .where(eq(gradingCandidates.id, preview.candidateId));
      }
    }

    for (const decision of input.decisions) {
      if (decision.decision === "promote") continue;
      const status: CandidateStatus = decision.decision === "hold_back" ? "held_back" : "no_show";
      if (status === "held_back") heldBack += 1;
      else noShows += 1;
      await tx
        .update(gradingCandidates)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(gradingCandidates.id, decision.candidateId),
            eq(gradingCandidates.gradingEventId, input.gradingEventId),
          ),
        );
    }

    await tx
      .update(gradingEvents)
      .set({
        status: "completed",
        completedAt: new Date(),
        gradedBy: input.gradedBy,
        updatedAt: new Date(),
      })
      .where(eq(gradingEvents.id, input.gradingEventId));
  });

  await audit({
    schoolId: input.schoolId,
    actorId: input.gradedBy,
    action: "grading.completed",
    target: input.gradingEventId,
    metadata: { promotions: previews.length, heldBack, noShows },
  });

  return { promotions: previews.length, heldBack, noShows };
}

/**
 * A spontaneous stripe on the mat: the same append + update path, minus the
 * event. One code path means a mat promotion is as attributable as a graded one.
 */
export async function matPromotion(input: {
  enrollmentId: string;
  schoolId: string;
  gradedBy: string;
  note?: string;
  promotedOn?: Date;
}): Promise<PromotionPreview> {
  const db = getDb();
  const [row] = await db
    .select({
      enrollment: enrollments,
      rank: ranks,
      programId: programs.id,
      firstName: students.firstName,
      lastName: students.lastName,
    })
    .from(enrollments)
    .innerJoin(ranks, eq(ranks.id, enrollments.currentRankId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.id, input.enrollmentId), eq(students.schoolId, input.schoolId)));
  if (!row) throw new Error("Enrollment not found");

  const ladder = await ladderFor(row.programId);
  const target = nextStep(row.rank, row.enrollment.currentStripes, ladder);
  if (!target) throw new Error("Already at the top of this ladder");

  const promotedOn = input.promotedOn ?? new Date();
  await db.transaction(async (tx) => {
    await tx.insert(promotions).values({
      enrollmentId: input.enrollmentId,
      fromRankId: row.rank.id,
      fromStripes: row.enrollment.currentStripes,
      toRankId: target.rank.id,
      toStripes: target.stripes,
      promotedOn,
      gradingEventId: null,
      gradedBy: input.gradedBy,
      note: input.note?.trim() ?? "",
    });
    await tx
      .update(enrollments)
      .set({
        currentRankId: target.rank.id,
        currentStripes: target.stripes,
        promotedAt: promotedOn,
        signoffAt: null,
        signoffBy: null,
        updatedAt: new Date(),
      })
      .where(eq(enrollments.id, input.enrollmentId));
  });

  await audit({
    schoolId: input.schoolId,
    actorId: input.gradedBy,
    action: "promotion.mat",
    target: input.enrollmentId,
    metadata: { toRank: target.rank.name, toStripes: target.stripes },
  });

  return {
    candidateId: null,
    enrollmentId: input.enrollmentId,
    studentName: `${row.firstName} ${row.lastName}`,
    fromRankId: row.rank.id,
    fromRankName: row.rank.name,
    fromBeltColorHex: row.rank.beltColorHex,
    fromStripes: row.enrollment.currentStripes,
    fromStripesTotal: row.rank.stripes,
    toRankId: target.rank.id,
    toRankName: target.rank.name,
    toBeltColorHex: target.rank.beltColorHex,
    toStripes: target.stripes,
    toStripesTotal: target.rank.stripes,
    step: target.step,
  };
}

/**
 * A correction. Appends a reversal — the mirror image of the promotion being
 * undone — and restores the enrollment to where it was. The promotion being
 * corrected stays on the record, because it happened.
 */
export async function reversePromotion(input: {
  promotionId: string;
  schoolId: string;
  actorId: string;
  reason: string;
}): Promise<void> {
  const db = getDb();
  const reason = input.reason.trim();
  if (reason.length < 3) throw new Error("Say why this promotion is being reversed");

  const [row] = await db
    .select({ promotion: promotions, timezone: schools.timezone })
    .from(promotions)
    .innerJoin(enrollments, eq(enrollments.id, promotions.enrollmentId))
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .innerJoin(schools, eq(schools.id, students.schoolId))
    .where(and(eq(promotions.id, input.promotionId), eq(students.schoolId, input.schoolId)));
  if (!row) throw new Error("Promotion not found");
  const p = row.promotion;

  await db.transaction(async (tx) => {
    await tx.insert(promotions).values({
      enrollmentId: p.enrollmentId,
      fromRankId: p.toRankId,
      fromStripes: p.toStripes,
      toRankId: p.fromRankId,
      toStripes: p.fromStripes,
      promotedOn: new Date(),
      gradingEventId: null,
      gradedBy: input.actorId,
      note: `Reversal of the ${formatDay(dayKey(p.promotedOn, row.timezone))} promotion — ${reason}`,
    });
    await tx
      .update(enrollments)
      .set({
        currentRankId: p.fromRankId,
        currentStripes: p.fromStripes,
        promotedAt: p.promotedOn,
        updatedAt: new Date(),
      })
      .where(eq(enrollments.id, p.enrollmentId));
  });

  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "promotion.reversed",
    target: input.promotionId,
    metadata: { reason },
  });
}

// -------------------------------------------------------------- timeline

export interface TimelineEntry {
  id: string;
  promotedOn: Date;
  fromRankName: string;
  fromStripes: number;
  toRankName: string;
  toStripes: number;
  toBeltColorHex: string;
  toStripesTotal: number;
  graderName: string | null;
  eventName: string | null;
  note: string;
}

/** The student's rank timeline — "the wall and the record". Newest first. */
export async function promotionTimeline(enrollmentIds: string[]): Promise<TimelineEntry[]> {
  if (enrollmentIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      promotion: promotions,
      toRankName: ranks.name,
      toBeltColorHex: ranks.beltColorHex,
      toStripesTotal: ranks.stripes,
      graderName: users.name,
      eventName: gradingEvents.name,
    })
    .from(promotions)
    .innerJoin(ranks, eq(ranks.id, promotions.toRankId))
    .leftJoin(users, eq(users.id, promotions.gradedBy))
    .leftJoin(gradingEvents, eq(gradingEvents.id, promotions.gradingEventId))
    .where(inArray(promotions.enrollmentId, enrollmentIds))
    .orderBy(desc(promotions.promotedOn), desc(promotions.createdAt));

  const fromNames = new Map<string, string>();
  const fromIds = [...new Set(rows.map((r) => r.promotion.fromRankId))];
  if (fromIds.length > 0) {
    const named = await db
      .select({ id: ranks.id, name: ranks.name })
      .from(ranks)
      .where(inArray(ranks.id, fromIds));
    for (const n of named) fromNames.set(n.id, n.name);
  }

  return rows.map((r) => ({
    id: r.promotion.id,
    promotedOn: r.promotion.promotedOn,
    fromRankName: fromNames.get(r.promotion.fromRankId) ?? "—",
    fromStripes: r.promotion.fromStripes,
    toRankName: r.toRankName,
    toStripes: r.promotion.toStripes,
    toBeltColorHex: r.toBeltColorHex,
    toStripesTotal: r.toStripesTotal,
    graderName: r.graderName,
    eventName: r.eventName,
    note: r.promotion.note,
  }));
}

// ------------------------------------------------------------- event list

export interface EventSummary extends GradingEvent {
  candidateCount: number;
  eligibleCount: number;
  promotedCount: number;
  programNames: string[];
}

export async function listEvents(schoolId: string): Promise<EventSummary[]> {
  const db = getDb();
  const events = await db
    .select()
    .from(gradingEvents)
    .where(eq(gradingEvents.schoolId, schoolId))
    .orderBy(desc(gradingEvents.heldOn));
  if (events.length === 0) return [];

  const candidates = await db
    .select({
      gradingEventId: gradingCandidates.gradingEventId,
      status: gradingCandidates.status,
    })
    .from(gradingCandidates)
    .where(inArray(gradingCandidates.gradingEventId, events.map((e) => e.id)));

  const programRows = await db
    .select({ id: programs.id, name: programs.name })
    .from(programs)
    .where(eq(programs.schoolId, schoolId));
  const programName = new Map(programRows.map((p) => [p.id, p.name]));

  return events.map((event) => {
    const mine = candidates.filter((c) => c.gradingEventId === event.id);
    return {
      ...event,
      candidateCount: mine.length,
      eligibleCount: mine.filter((c) => c.status === "eligible" || c.status === "invited" || c.status === "confirmed").length,
      promotedCount: mine.filter((c) => c.status === "promoted").length,
      programNames: event.programIds.map((id) => programName.get(id) ?? "Program").filter(Boolean),
    };
  });
}

export async function createEvent(input: {
  schoolId: string;
  name: string;
  heldOn: Date;
  programIds: string[];
  actorId: string;
}): Promise<GradingEvent> {
  if (input.programIds.length === 0) throw new Error("Pick at least one program to grade");
  const name = input.name.trim();
  if (name.length < 2) throw new Error("Give the event a name");
  const db = getDb();
  const [event] = await db
    .insert(gradingEvents)
    .values({
      schoolId: input.schoolId,
      name,
      heldOn: input.heldOn,
      programIds: input.programIds,
      status: "draft",
    })
    .returning();
  await audit({
    schoolId: input.schoolId,
    actorId: input.actorId,
    action: "grading.created",
    target: event.id,
    metadata: { name, programs: input.programIds.length },
  });
  return event;
}
