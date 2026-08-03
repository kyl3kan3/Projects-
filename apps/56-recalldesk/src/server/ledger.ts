/**
 * src/server/ledger.ts
 *
 * The attribution ledger: the only place recovered production is calculated, and
 * the only number the product reports.
 *
 * `attributeBooking` is the whole rule in one function — find the most recent
 * qualifying touch inside the practice's window, and write a row if and only if
 * there is one. `attributions.booking_id` is unique, so the nightly run, a
 * front-desk confirm and a manual re-run cannot triple-count the same booking
 * between them.
 *
 * Note what is deliberately absent: any "estimated", "influenced" or "assisted"
 * figure. A skeptical dentist gets one number, and every dollar of it expands
 * into a named patient, a timestamped touch and a booking date.
 */

import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  attributions,
  bookings,
  patients,
  practices,
  touches,
  visits,
  type Attribution,
  type Booking,
} from "@/db/schema";
import {
  pickQualifyingTouch,
  productionCentsFor,
  visitValueCentsFor,
  windowDaysFor,
  type TouchRecord,
} from "@/lib/attribution";
import { addDays, toDayStart } from "@/lib/dates";
import { bucketFor } from "@/lib/recall";

interface PracticePolicy {
  windowDays: number;
  visitValueCents: number;
}

async function policyFor(practiceId: string): Promise<PracticePolicy> {
  const db = getDb();
  const [practice] = await db.select().from(practices).where(eq(practices.id, practiceId));
  return {
    windowDays: windowDaysFor(practice?.settings),
    visitValueCents: visitValueCentsFor(practice?.settings),
  };
}

/**
 * Attribute one booking. Returns the row when one was written, null when the
 * booking has no qualifying touch — which is a normal, common, honest outcome.
 */
export async function attributeBooking(input: {
  bookingId: string;
  practiceId: string;
}): Promise<{ attribution: Attribution | null; reason?: "already" | "no_touch" }> {
  const db = getDb();
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, input.bookingId));
  if (!booking) return { attribution: null, reason: "no_touch" };

  const [existing] = await db
    .select()
    .from(attributions)
    .where(eq(attributions.bookingId, booking.id));
  if (existing) return { attribution: existing, reason: "already" };

  const policy = await policyFor(input.practiceId);
  const windowStart = new Date(booking.bookedAt.getTime() - policy.windowDays * 86_400_000);

  const candidates = await db
    .select({
      id: touches.id,
      patientId: touches.patientId,
      channel: touches.channel,
      status: touches.status,
      occurredAt: touches.occurredAt,
    })
    .from(touches)
    .where(
      and(
        eq(touches.patientId, booking.patientId),
        gte(touches.occurredAt, windowStart),
        lte(touches.occurredAt, booking.bookedAt),
      ),
    )
    .orderBy(desc(touches.occurredAt));

  const match = pickQualifyingTouch(
    { id: booking.id, patientId: booking.patientId, bookedAt: booking.bookedAt },
    candidates as TouchRecord[],
    policy.windowDays,
  );
  if (!match) return { attribution: null, reason: "no_touch" };

  // booking_id is unique: a concurrent run loses the race and that is correct.
  const [row] = await db
    .insert(attributions)
    .values({
      bookingId: booking.id,
      touchId: match.touch.id,
      windowDays: policy.windowDays,
      productionCents: productionCentsFor(policy.visitValueCents),
    })
    .onConflictDoNothing()
    .returning();

  return { attribution: row ?? null, reason: row ? undefined : "already" };
}

/** The nightly pass over every unattributed booking at a location. */
export async function attributeBookingsForLocation(input: {
  locationId: string;
  practiceId: string;
  limit?: number;
}): Promise<{ attributed: number; skippedNoTouch: number }> {
  const db = getDb();
  const pending = await db
    .select({ id: bookings.id })
    .from(bookings)
    .leftJoin(attributions, eq(attributions.bookingId, bookings.id))
    .where(and(eq(bookings.locationId, input.locationId), isNull(attributions.id)))
    .orderBy(asc(bookings.bookedAt))
    .limit(input.limit ?? 500);

  let attributed = 0;
  let skippedNoTouch = 0;
  for (const row of pending) {
    const result = await attributeBooking({ bookingId: row.id, practiceId: input.practiceId });
    if (result.attribution) attributed++;
    else skippedNoTouch++;
  }
  return { attributed, skippedNoTouch };
}

/* ------------------------------------------------------------------ reading */

export interface RecoveredSummary {
  monthCents: number;
  monthBookings: number;
  quarterCents: number;
  quarterBookings: number;
  allTimeCents: number;
  /** Bookings with no qualifying touch — shown, never counted. */
  unattributedBookings: number;
  touchesSentThisMonth: number;
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfQuarter(now: Date): Date {
  const q = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), q, 1));
}

export async function recoveredSummary(input: {
  locationId: string;
  now?: Date;
}): Promise<RecoveredSummary> {
  const db = getDb();
  const now = input.now ?? new Date();
  const monthStart = startOfMonth(now);
  const quarterStart = startOfQuarter(now);
  // Boundaries go into these aggregate filters as ISO strings with an explicit
  // cast. A JS `Date` interpolated into a raw `sql` fragment skips Drizzle's
  // column encoder and throws inside postgres.js at runtime.
  const monthIso = monthStart.toISOString();
  const quarterIso = quarterStart.toISOString();

  const [totals] = await db
    .select({
      monthCents: sql<number>`coalesce(sum(${attributions.productionCents}) filter (where ${attributions.attributedAt} >= ${monthIso}::timestamptz), 0)::int`,
      monthBookings: sql<number>`count(*) filter (where ${attributions.attributedAt} >= ${monthIso}::timestamptz)::int`,
      quarterCents: sql<number>`coalesce(sum(${attributions.productionCents}) filter (where ${attributions.attributedAt} >= ${quarterIso}::timestamptz), 0)::int`,
      quarterBookings: sql<number>`count(*) filter (where ${attributions.attributedAt} >= ${quarterIso}::timestamptz)::int`,
      allTimeCents: sql<number>`coalesce(sum(${attributions.productionCents}), 0)::int`,
    })
    .from(attributions)
    .innerJoin(bookings, eq(bookings.id, attributions.bookingId))
    .where(eq(bookings.locationId, input.locationId));

  const [unattributed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .leftJoin(attributions, eq(attributions.bookingId, bookings.id))
    .where(and(eq(bookings.locationId, input.locationId), isNull(attributions.id)));

  const [touchCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(touches)
    .where(
      and(
        eq(touches.locationId, input.locationId),
        gte(touches.occurredAt, monthStart),
        inArray(touches.status, ["sent", "delivered", "answered", "left_message"]),
      ),
    );

  return {
    monthCents: Number(totals?.monthCents ?? 0),
    monthBookings: Number(totals?.monthBookings ?? 0),
    quarterCents: Number(totals?.quarterCents ?? 0),
    quarterBookings: Number(totals?.quarterBookings ?? 0),
    allTimeCents: Number(totals?.allTimeCents ?? 0),
    unattributedBookings: Number(unattributed?.n ?? 0),
    touchesSentThisMonth: Number(touchCount?.n ?? 0),
  };
}

export interface LedgerRow {
  bookingId: string;
  patientId: string;
  patientName: string;
  patientInitials: string;
  bookedAt: Date;
  appointmentOn: Date | null;
  source: Booking["source"];
  kept: boolean | null;
  /** Present only when a qualifying touch was found. */
  attribution: {
    productionCents: number;
    windowDays: number;
    attributedAt: Date;
    touchChannel: "email" | "sms" | "call";
    touchOccurredAt: Date;
    touchStatus: string;
    daysBefore: number;
  } | null;
}

/** Receipt-grade rows: every dollar traceable, every unattributed booking visible. */
export async function ledgerRows(input: {
  locationId: string;
  limit?: number;
  attributedOnly?: boolean;
}): Promise<LedgerRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      booking: bookings,
      patient: patients,
      attribution: attributions,
      touch: touches,
    })
    .from(bookings)
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .leftJoin(attributions, eq(attributions.bookingId, bookings.id))
    .leftJoin(touches, eq(touches.id, attributions.touchId))
    .where(eq(bookings.locationId, input.locationId))
    .orderBy(desc(bookings.bookedAt))
    .limit(input.limit ?? 50);

  return rows
    .filter((r) => (input.attributedOnly ? r.attribution !== null : true))
    .map((r) => ({
      bookingId: r.booking.id,
      patientId: r.patient.id,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
      patientInitials: `${r.patient.firstName[0] ?? ""}${r.patient.lastName[0] ?? ""}`.toUpperCase(),
      bookedAt: r.booking.bookedAt,
      appointmentOn: r.booking.appointmentOn,
      source: r.booking.source,
      kept: r.booking.kept,
      attribution:
        r.attribution && r.touch
          ? {
              productionCents: r.attribution.productionCents,
              windowDays: r.attribution.windowDays,
              attributedAt: r.attribution.attributedAt,
              touchChannel: r.touch.channel,
              touchOccurredAt: r.touch.occurredAt,
              touchStatus: r.touch.status,
              daysBefore: Math.floor(
                (r.booking.bookedAt.getTime() - r.touch.occurredAt.getTime()) / 86_400_000,
              ),
            }
          : null,
    }));
}

export interface WeekSlot {
  day: string;
  weekdayLabel: string;
  filled: boolean;
  initials: string | null;
  bookings: number;
}

/**
 * The week-strip: seven hygiene slots, filled strictly by attributed bookings.
 *
 * DESIGN.md is explicit that this is data-driven — a cell fills because a patient
 * booked and the booking earned an attribution row, never because the strip
 * looked empty.
 */
export async function weekStrip(input: {
  locationId: string;
  now?: Date;
}): Promise<{ slots: WeekSlot[]; weekStart: Date }> {
  const db = getDb();
  const now = input.now ?? new Date();
  const today = toDayStart(now);
  // Monday-first week containing today.
  const weekStart = addDays(today, -((today.getUTCDay() + 6) % 7));
  const weekEnd = addDays(weekStart, 7);

  const rows = await db
    .select({
      appointmentOn: bookings.appointmentOn,
      bookedAt: bookings.bookedAt,
      firstName: patients.firstName,
      lastName: patients.lastName,
    })
    .from(attributions)
    .innerJoin(bookings, eq(bookings.id, attributions.bookingId))
    .innerJoin(patients, eq(patients.id, bookings.patientId))
    .where(
      and(
        eq(bookings.locationId, input.locationId),
        // The slot a booking fills is its appointment day, falling back to the day
        // it was booked. Bounds are ISO strings with explicit casts, never Dates
        // inside a raw fragment.
        sql`coalesce(${bookings.appointmentOn}, ${bookings.bookedAt}) >= ${weekStart.toISOString()}::timestamptz`,
        sql`coalesce(${bookings.appointmentOn}, ${bookings.bookedAt}) < ${weekEnd.toISOString()}::timestamptz`,
      ),
    )
    .orderBy(asc(bookings.bookedAt));

  const byDay = new Map<string, { initials: string; count: number }>();
  for (const r of rows) {
    const key = toDayStart(r.appointmentOn ?? r.bookedAt).toISOString().slice(0, 10);
    const initials = `${r.firstName[0] ?? ""}${r.lastName[0] ?? ""}`.toUpperCase();
    const current = byDay.get(key);
    byDay.set(key, { initials: current?.initials ?? initials, count: (current?.count ?? 0) + 1 });
  }

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const slots: WeekSlot[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = date.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    slots.push({
      day: key,
      weekdayLabel: labels[i],
      filled: Boolean(hit),
      initials: hit?.initials ?? null,
      bookings: hit?.count ?? 0,
    });
  }
  return { slots, weekStart };
}

/**
 * The owner report's honesty section: how often *untouched* overdue patients came
 * back on their own over the same period.
 *
 * README risk 4 is "that patient would have come back anyway". The answer is not
 * an argument, it is this number — computed from the practice's own data, and
 * printed next to the recovered figure even when it is unflattering.
 */
export async function holdoutComparison(input: {
  locationId: string;
  days?: number;
  now?: Date;
}): Promise<{
  days: number;
  touchedPatients: number;
  touchedReturned: number;
  untouchedPatients: number;
  untouchedReturned: number;
  touchedRate: number;
  untouchedRate: number;
  liftPoints: number;
}> {
  const db = getDb();
  const now = input.now ?? new Date();
  const days = input.days ?? 90;
  const since = new Date(now.getTime() - days * 86_400_000);

  // Everyone who was chase-worthy at the start of the window: approximated by
  // their due date being at least three months before `since`.
  const roster = await db
    .select({
      id: patients.id,
      nextDueOn: patients.nextDueOn,
    })
    .from(patients)
    .where(and(eq(patients.locationId, input.locationId), eq(patients.status, "active")));

  const eligible = roster.filter((p) => bucketFor(p.nextDueOn, since) !== "current");
  if (eligible.length === 0) {
    return {
      days,
      touchedPatients: 0,
      touchedReturned: 0,
      untouchedPatients: 0,
      untouchedReturned: 0,
      touchedRate: 0,
      untouchedRate: 0,
      liftPoints: 0,
    };
  }
  const eligibleIds = eligible.map((p) => p.id);

  const touchedRows = await db
    .selectDistinct({ patientId: touches.patientId })
    .from(touches)
    .where(
      and(
        inArray(touches.patientId, eligibleIds),
        gte(touches.occurredAt, since),
        inArray(touches.status, ["sent", "delivered", "answered", "left_message"]),
      ),
    );
  const touched = new Set(touchedRows.map((r) => r.patientId));

  const bookedRows = await db
    .selectDistinct({ patientId: bookings.patientId })
    .from(bookings)
    .where(and(inArray(bookings.patientId, eligibleIds), gte(bookings.bookedAt, since)));
  const visitedRows = await db
    .selectDistinct({ patientId: visits.patientId })
    .from(visits)
    .where(and(inArray(visits.patientId, eligibleIds), gte(visits.visitedOn, since)));
  const returned = new Set([
    ...bookedRows.map((r) => r.patientId),
    ...visitedRows.map((r) => r.patientId),
  ]);

  let touchedPatients = 0;
  let touchedReturned = 0;
  let untouchedPatients = 0;
  let untouchedReturned = 0;
  for (const p of eligible) {
    if (touched.has(p.id)) {
      touchedPatients++;
      if (returned.has(p.id)) touchedReturned++;
    } else {
      untouchedPatients++;
      if (returned.has(p.id)) untouchedReturned++;
    }
  }

  const touchedRate = touchedPatients ? touchedReturned / touchedPatients : 0;
  const untouchedRate = untouchedPatients ? untouchedReturned / untouchedPatients : 0;
  return {
    days,
    touchedPatients,
    touchedReturned,
    untouchedPatients,
    untouchedReturned,
    touchedRate,
    untouchedRate,
    liftPoints: Math.round((touchedRate - untouchedRate) * 1000) / 10,
  };
}
