/**
 * src/server/queue.ts
 *
 * The front desk's daily call queue, and the bookings it produces.
 *
 * Three things it is not: a report, a backlog, and a place where a disposition
 * gets lost. It is rebuilt fresh every morning (yesterday's unworked rows are
 * deleted, not carried forward as guilt), it is ranked so the tenth call is
 * genuinely worse than the first, and every disposition writes a `touches` row —
 * which is what makes front-desk work count in the ledger.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bookingRequests,
  bookings,
  callTasks,
  campaigns,
  enrollments,
  patients,
  touches,
  type Booking,
  type CallTask,
  type Patient,
} from "@/db/schema";
import { fromDayString, todayInTimezone, toDayStart } from "@/lib/dates";
import { rankQueue, type RankInput } from "@/lib/ranking";
import { bucketFor, type OverdueBucket } from "@/lib/recall";
import { audit } from "@/server/audit";
import { attributeBooking } from "@/server/ledger";
import { stopEnrollmentsFor } from "@/server/campaigns";

export const DEFAULT_QUEUE_SIZE = 20;

export interface QueueCard {
  task: CallTask;
  patient: Patient;
  bucket: OverdueBucket;
  lastTouchAt: Date | null;
  lastTouchChannel: "email" | "sms" | "call" | null;
  valueCents: number;
}

/**
 * Materialise today's queue for a location. Idempotent per (location, date): a
 * second call re-ranks and updates, and never duplicates a task or resets one the
 * front desk has already worked.
 */
export async function buildQueue(input: {
  locationId: string;
  queueDate: string;
  visitValueCents: number;
  limit?: number;
  today?: Date;
}): Promise<{ tasksCreated: number; tasksUpdated: number; expired: number }> {
  const db = getDb();
  const today = input.today ?? fromDayString(input.queueDate) ?? new Date();
  const limit = input.limit ?? DEFAULT_QUEUE_SIZE;

  // Yesterday's unworked rows expire — tomorrow's queue is built fresh.
  const expired = await db
    .delete(callTasks)
    .where(
      and(
        eq(callTasks.locationId, input.locationId),
        lt(callTasks.queueDate, input.queueDate),
        eq(callTasks.status, "todo"),
      ),
    )
    .returning({ id: callTasks.id });

  const roster = await db
    .select({
      id: patients.id,
      nextDueOn: patients.nextDueOn,
      phone: patients.phone,
      doNotContact: patients.doNotContact,
    })
    .from(patients)
    .where(and(eq(patients.locationId, input.locationId), eq(patients.status, "active")));

  const ids = roster.map((p) => p.id);
  if (ids.length === 0) {
    return { tasksCreated: 0, tasksUpdated: 0, expired: expired.length };
  }

  const lastTouches = await db
    .select({
      patientId: touches.patientId,
      lastTouchAt: sql<string>`max(${touches.occurredAt})`,
    })
    .from(touches)
    .where(
      and(
        inArray(touches.patientId, ids),
        inArray(touches.status, ["sent", "delivered", "answered", "left_message"]),
      ),
    )
    .groupBy(touches.patientId);
  const lastTouchMap = new Map(lastTouches.map((t) => [t.patientId, new Date(t.lastTouchAt)]));

  const midSequence = await db
    .select({ patientId: enrollments.patientId })
    .from(enrollments)
    .innerJoin(campaigns, eq(campaigns.id, enrollments.campaignId))
    .where(
      and(
        eq(campaigns.locationId, input.locationId),
        eq(campaigns.status, "running"),
        eq(enrollments.status, "active"),
      ),
    );
  const midSequenceIds = new Set(midSequence.map((m) => m.patientId));

  // Someone booked in the last 60 days is not a call, whatever their due date says.
  const recentlyBooked = await db
    .selectDistinct({ patientId: bookings.patientId })
    .from(bookings)
    .where(
      and(
        eq(bookings.locationId, input.locationId),
        gte(bookings.bookedAt, new Date(today.getTime() - 60 * 86_400_000)),
      ),
    );
  const bookedIds = new Set(recentlyBooked.map((b) => b.patientId));

  const inputs: RankInput[] = roster
    .filter((p) => !bookedIds.has(p.id))
    .map((p) => {
      const lastTouchAt = lastTouchMap.get(p.id) ?? null;
      return {
        patientId: p.id,
        bucket: bucketFor(p.nextDueOn, today),
        valueCents: input.visitValueCents,
        daysSinceLastTouch: lastTouchAt
          ? Math.floor((toDayStart(today).getTime() - toDayStart(lastTouchAt).getTime()) / 86_400_000)
          : null,
        midSequence: midSequenceIds.has(p.id),
        doNotContact: p.doNotContact,
        hasPhone: Boolean(p.phone),
      };
    });

  const ranked = rankQueue(inputs, limit);
  let tasksCreated = 0;
  let tasksUpdated = 0;

  for (const task of ranked) {
    const inserted = await db
      .insert(callTasks)
      .values({
        locationId: input.locationId,
        patientId: task.patientId,
        queueDate: input.queueDate,
        rank: task.rank,
        reason: {
          bucket: task.bucket,
          valueCents: task.valueCents,
          lastTouchDays: task.daysSinceLastTouch ?? undefined,
        },
      })
      .onConflictDoNothing()
      .returning({ id: callTasks.id });

    if (inserted.length) {
      tasksCreated++;
      continue;
    }
    // Existing row: re-rank it, but only while it is still untouched.
    const updated = await db
      .update(callTasks)
      .set({
        rank: task.rank,
        reason: {
          bucket: task.bucket,
          valueCents: task.valueCents,
          lastTouchDays: task.daysSinceLastTouch ?? undefined,
        },
      })
      .where(
        and(
          eq(callTasks.locationId, input.locationId),
          eq(callTasks.patientId, task.patientId),
          eq(callTasks.queueDate, input.queueDate),
          eq(callTasks.status, "todo"),
        ),
      )
      .returning({ id: callTasks.id });
    tasksUpdated += updated.length;
  }

  return { tasksCreated, tasksUpdated, expired: expired.length };
}

export function queueDateFor(timezone: string, now: Date = new Date()): string {
  return todayInTimezone(timezone, now);
}

export async function todaysQueue(input: {
  locationId: string;
  queueDate: string;
  visitValueCents: number;
  today?: Date;
}): Promise<QueueCard[]> {
  const db = getDb();
  const today = input.today ?? new Date();
  const rows = await db
    .select({ task: callTasks, patient: patients })
    .from(callTasks)
    .innerJoin(patients, eq(patients.id, callTasks.patientId))
    .where(and(eq(callTasks.locationId, input.locationId), eq(callTasks.queueDate, input.queueDate)))
    .orderBy(asc(callTasks.rank));

  if (rows.length === 0) return [];

  const lastTouchRows = await db
    .select({
      patientId: touches.patientId,
      occurredAt: touches.occurredAt,
      channel: touches.channel,
    })
    .from(touches)
    .where(
      and(
        inArray(touches.patientId, rows.map((r) => r.patient.id)),
        inArray(touches.status, ["sent", "delivered", "answered", "left_message"]),
      ),
    )
    .orderBy(desc(touches.occurredAt));

  const lastTouch = new Map<string, { at: Date; channel: "email" | "sms" | "call" }>();
  for (const t of lastTouchRows) {
    if (!lastTouch.has(t.patientId)) lastTouch.set(t.patientId, { at: t.occurredAt, channel: t.channel });
  }

  return rows.map(({ task, patient }) => ({
    task,
    patient,
    bucket: bucketFor(patient.nextDueOn, today),
    lastTouchAt: lastTouch.get(patient.id)?.at ?? null,
    lastTouchChannel: lastTouch.get(patient.id)?.channel ?? null,
    valueCents: input.visitValueCents,
  }));
}

export interface QueueProgress {
  worked: number;
  total: number;
  booked: number;
}

export async function queueProgress(input: {
  locationId: string;
  queueDate: string;
}): Promise<QueueProgress> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      worked: sql<number>`count(*) filter (where ${callTasks.status} <> 'todo')::int`,
      booked: sql<number>`count(*) filter (where ${callTasks.status} = 'booked')::int`,
    })
    .from(callTasks)
    .where(and(eq(callTasks.locationId, input.locationId), eq(callTasks.queueDate, input.queueDate)));
  return {
    total: Number(row?.total ?? 0),
    worked: Number(row?.worked ?? 0),
    booked: Number(row?.booked ?? 0),
  };
}

/* ------------------------------------------------------------- dispositions */

export type Outcome = "booked" | "left_message" | "call_back" | "skip" | "do_not_contact";

/**
 * Two taps: an outcome, and (for a booking) the appointment date.
 *
 * Which outcomes are outreach — and therefore `touches` rows that can earn an
 * attribution — is a judgement worth stating: reaching a patient and leaving a
 * message are. Skipping someone is not, and neither is marking them
 * do-not-contact; recording those as outreach would let the front desk
 * accidentally manufacture attributions by clearing the queue.
 */
export async function disposition(input: {
  callTaskId: string;
  locationIds: string[];
  practiceId: string;
  userId: string;
  outcome: Outcome;
  note?: string;
  appointmentOn?: Date | null;
  now?: Date;
}): Promise<{ booking: Booking | null; attributed: boolean }> {
  const db = getDb();
  const now = input.now ?? new Date();

  const [row] = await db
    .select({ task: callTasks, patient: patients })
    .from(callTasks)
    .innerJoin(patients, eq(patients.id, callTasks.patientId))
    .where(and(eq(callTasks.id, input.callTaskId), inArray(callTasks.locationId, input.locationIds)));
  if (!row) throw new Error("That call is not on your queue.");
  const { task, patient } = row;

  await db
    .update(callTasks)
    .set({
      status: input.outcome,
      note: input.note?.trim() || task.note,
      handledBy: input.userId,
      handledAt: now,
    })
    .where(eq(callTasks.id, task.id));

  // The call itself, as a touch — only where a human actually reached out.
  if (input.outcome === "booked" || input.outcome === "left_message" || input.outcome === "call_back") {
    await db.insert(touches).values({
      patientId: patient.id,
      locationId: task.locationId,
      campaignId: null,
      channel: "call",
      status: input.outcome === "left_message" ? "left_message" : "answered",
      occurredAt: now,
    });
  }

  await audit({
    practiceId: input.practiceId,
    actorId: input.userId,
    action: "queue.disposition",
    target: `patient:${patient.id}`,
    metadata: { outcome: input.outcome, queueDate: task.queueDate, rank: task.rank },
  });

  if (input.outcome === "do_not_contact") {
    await db
      .update(patients)
      .set({ doNotContact: true, updatedAt: now })
      .where(eq(patients.id, patient.id));
    await stopEnrollmentsFor({ patientId: patient.id, reason: "manual" });
    await audit({
      practiceId: input.practiceId,
      actorId: input.userId,
      action: "consent.do_not_contact",
      target: `patient:${patient.id}`,
      metadata: { source: "call_queue" },
    });
    return { booking: null, attributed: false };
  }

  if (input.outcome === "booked") {
    const result = await recordBooking({
      patientId: patient.id,
      locationId: task.locationId,
      practiceId: input.practiceId,
      source: "call",
      appointmentOn: input.appointmentOn ?? null,
      recordedBy: input.userId,
      now,
    });
    return result;
  }

  return { booking: null, attributed: false };
}

/**
 * Record a booking, from wherever it came, and attribute it immediately.
 *
 * Immediately rather than overnight because DESIGN.md's chair-fill fires on a
 * front-desk confirm as well as the nightly run — and because a front desk that
 * has to wait until tomorrow to see the number move stops believing in it.
 * `attributions.booking_id` being unique makes the nightly pass a no-op for rows
 * this already handled.
 */
export async function recordBooking(input: {
  patientId: string;
  locationId: string;
  practiceId: string;
  source: Booking["source"];
  appointmentOn: Date | null;
  recordedBy?: string | null;
  bookingRequestId?: string | null;
  now?: Date;
}): Promise<{ booking: Booking; attributed: boolean }> {
  const db = getDb();
  const now = input.now ?? new Date();

  const [booking] = await db
    .insert(bookings)
    .values({
      patientId: input.patientId,
      locationId: input.locationId,
      bookedAt: now,
      appointmentOn: input.appointmentOn,
      source: input.source,
      recordedBy: input.recordedBy ?? null,
    })
    .returning();

  // Nobody gets a "come back!" message the day after they booked.
  await stopEnrollmentsFor({ patientId: input.patientId, reason: "booked" });

  if (input.bookingRequestId) {
    await db
      .update(bookingRequests)
      .set({ status: "booked" })
      .where(eq(bookingRequests.id, input.bookingRequestId));
  }

  const result = await attributeBooking({ bookingId: booking.id, practiceId: input.practiceId });

  await audit({
    practiceId: input.practiceId,
    actorId: input.recordedBy ?? null,
    action: "booking.recorded",
    target: `booking:${booking.id}`,
    metadata: {
      source: input.source,
      attributed: Boolean(result.attribution),
      windowDays: result.attribution?.windowDays,
    },
  });

  return { booking, attributed: Boolean(result.attribution) };
}

/* ---------------------------------------------------------- booking requests */

export interface PinnedRequest {
  id: string;
  patientId: string;
  patientName: string;
  phone: string | null;
  preferredWindows: { day: string; period: "am" | "pm" }[];
  note: string | null;
  createdAt: Date;
}

/** New requests from booking links, pinned above the queue. */
export async function pendingBookingRequests(locationId: string): Promise<PinnedRequest[]> {
  const db = getDb();
  const rows = await db
    .select({ request: bookingRequests, patient: patients })
    .from(bookingRequests)
    .innerJoin(patients, eq(patients.id, bookingRequests.patientId))
    .where(and(eq(patients.locationId, locationId), inArray(bookingRequests.status, ["new", "contacted"])))
    .orderBy(desc(bookingRequests.createdAt))
    .limit(25);

  return rows.map(({ request, patient }) => ({
    id: request.id,
    patientId: patient.id,
    patientName: `${patient.firstName} ${patient.lastName}`.trim(),
    phone: patient.phone,
    preferredWindows: request.preferredWindows,
    note: request.note,
    createdAt: request.createdAt,
  }));
}

export async function closeBookingRequest(input: {
  requestId: string;
  locationIds: string[];
  status: "contacted" | "closed";
}): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ request: bookingRequests })
    .from(bookingRequests)
    .innerJoin(patients, eq(patients.id, bookingRequests.patientId))
    .where(
      and(eq(bookingRequests.id, input.requestId), inArray(patients.locationId, input.locationIds)),
    );
  if (!row) throw new Error("That request does not exist.");
  await db
    .update(bookingRequests)
    .set({ status: input.status })
    .where(eq(bookingRequests.id, input.requestId));
}

/** A patient's own booking request from the tokenised page. */
export async function createBookingRequest(input: {
  patientId: string;
  touchId: string | null;
  preferredWindows: { day: string; period: "am" | "pm" }[];
  note: string | null;
  phone?: string | null;
}): Promise<void> {
  const db = getDb();
  if (input.preferredWindows.length === 0) {
    throw new Error("Choose at least one time that works for you.");
  }

  // An open request already exists: update it rather than stacking duplicates on
  // the front desk's queue when a patient taps the link twice.
  const [existing] = await db
    .select()
    .from(bookingRequests)
    .where(
      and(eq(bookingRequests.patientId, input.patientId), eq(bookingRequests.status, "new")),
    )
    .orderBy(desc(bookingRequests.createdAt))
    .limit(1);

  if (existing) {
    await db
      .update(bookingRequests)
      .set({
        preferredWindows: input.preferredWindows,
        note: input.note,
        touchId: input.touchId ?? existing.touchId,
      })
      .where(eq(bookingRequests.id, existing.id));
  } else {
    await db.insert(bookingRequests).values({
      patientId: input.patientId,
      touchId: input.touchId,
      preferredWindows: input.preferredWindows,
      note: input.note,
    });
  }

  // A patient who asked for a time is not someone to keep chasing.
  await stopEnrollmentsFor({ patientId: input.patientId, reason: "booked" });

  if (input.phone) {
    await db
      .update(patients)
      .set({ phone: input.phone, phoneFailedAt: null, updatedAt: new Date() })
      .where(and(eq(patients.id, input.patientId), ne(patients.phone, input.phone)));
  }
}

/** Bookings not yet confirmed as kept, for the ledger's honesty column. */
export async function unkeptBookings(locationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(and(eq(bookings.locationId, locationId), isNull(bookings.kept)));
  return Number(row?.n ?? 0);
}
