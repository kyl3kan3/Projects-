/**
 * src/server/overdue.ts
 *
 * The overdue list and its dollar total — "the screen that converts the trial".
 *
 * The one thing to understand here: **the bucket a user sees is always computed
 * as of now, never read from `patients.overdue_bucket`.** That column is a cache
 * the nightly recompute writes, useful for indexes; if a screen rendered it
 * directly, a practice looking at the list on Tuesday afternoon would see
 * Monday-night's answer, and a patient who crossed into "12–24 months" this
 * morning would still read as 6–12. Bucket boundaries are therefore turned into
 * date thresholds at query time and applied to `next_due_on` itself.
 *
 * Thresholds are passed as ISO strings with an explicit `::timestamptz` cast
 * wherever a raw SQL fragment is unavoidable. A JS `Date` interpolated into a
 * `sql` fragment skips Drizzle's encoder and throws inside postgres.js at
 * runtime — which a type-checker and a production build will both happily miss.
 */

import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { patients, touches, visits, type Patient } from "@/db/schema";
import { addMonths, toDayStart } from "@/lib/dates";
import {
  ALL_BUCKETS,
  CHASE_BUCKETS,
  bucketFor,
  computeNextDue,
  inferRecallInterval,
  type OverdueBucket,
} from "@/lib/recall";

/** Bucket -> [inclusive latest due date, exclusive earliest due date]. */
function thresholds(today: Date) {
  const t = toDayStart(today);
  return {
    m3: addMonths(t, -3),
    m6: addMonths(t, -6),
    m12: addMonths(t, -12),
    m24: addMonths(t, -24),
  };
}

/** A SQL predicate for "this patient is in this bucket, as of today". */
function bucketPredicate(bucket: OverdueBucket, today: Date) {
  const { m3, m6, m12, m24 } = thresholds(today);
  switch (bucket) {
    case "current":
      return or(isNull(patients.nextDueOn), gt(patients.nextDueOn, m3));
    case "m3_6":
      return and(lte(patients.nextDueOn, m3), gt(patients.nextDueOn, m6));
    case "m6_12":
      return and(lte(patients.nextDueOn, m6), gt(patients.nextDueOn, m12));
    case "m12_24":
      return and(lte(patients.nextDueOn, m12), gt(patients.nextDueOn, m24));
    case "m24_plus":
      return lte(patients.nextDueOn, m24);
  }
}

export interface OverdueFilters {
  buckets?: OverdueBucket[];
  /** Only patients we could email (consent + address + no bounce/opt-out). */
  emailable?: boolean;
  /** Only patients we could text. */
  textable?: boolean;
  /** Hide do-not-contact and suppressed records. */
  contactableOnly?: boolean;
  /** Only patients not touched in this many days. */
  quietForDays?: number;
  search?: string;
}

export interface OverdueRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  emailConsent: boolean;
  smsConsent: boolean;
  emailOptedOutAt: Date | null;
  smsOptedOutAt: Date | null;
  emailBouncedAt: Date | null;
  phoneFailedAt: Date | null;
  doNotContact: boolean;
  recallIntervalMonths: number;
  lastVisitOn: Date | null;
  nextDueOn: Date | null;
  lastTouchAt: Date | null;
  bucket: OverdueBucket;
  valueCents: number;
}

function emailableCondition() {
  return and(
    eq(patients.emailConsent, true),
    isNotNull(patients.email),
    isNull(patients.emailOptedOutAt),
    isNull(patients.emailBouncedAt),
  );
}

function textableCondition() {
  return and(
    eq(patients.smsConsent, true),
    isNotNull(patients.phone),
    isNull(patients.smsOptedOutAt),
    isNull(patients.phoneFailedAt),
  );
}

function filterConditions(
  locationId: string,
  filters: OverdueFilters,
  today: Date,
  lastTouch: { lastTouchAt: unknown },
) {
  const conditions = [
    eq(patients.locationId, locationId),
    eq(patients.status, "active"),
  ];

  const buckets = filters.buckets?.length ? filters.buckets : CHASE_BUCKETS;
  const bucketOr = buckets.map((b) => bucketPredicate(b, today));
  const combined = bucketOr.length === 1 ? bucketOr[0] : or(...bucketOr);
  if (combined) conditions.push(combined);

  if (filters.emailable) conditions.push(emailableCondition()!);
  if (filters.textable) conditions.push(textableCondition()!);
  if (filters.contactableOnly) conditions.push(eq(patients.doNotContact, false));

  if (filters.quietForDays && filters.quietForDays > 0) {
    const cutoff = new Date(Date.now() - filters.quietForDays * 86_400_000);
    const quiet = or(
      isNull(lastTouch.lastTouchAt as never),
      lte(lastTouch.lastTouchAt as never, cutoff),
    );
    if (quiet) conditions.push(quiet);
  }

  const search = filters.search?.trim();
  if (search) {
    const like = `%${search.toLowerCase()}%`;
    const matched = or(
      sql`lower(${patients.firstName}) like ${like}`,
      sql`lower(${patients.lastName}) like ${like}`,
      sql`lower(coalesce(${patients.email}, '')) like ${like}`,
      sql`coalesce(${patients.phone}, '') like ${like}`,
      sql`lower(coalesce(${patients.externalId}, '')) like ${like}`,
    );
    if (matched) conditions.push(matched);
  }

  return and(...conditions);
}

/**
 * Last touch per patient, as a joinable subquery. Built with the query builder
 * rather than a select-list `sql` fragment: an unqualified column inside one of
 * those binds to the subquery's own alias and silently returns nulls forever.
 */
function lastTouchSubquery() {
  const db = getDb();
  return db
    .select({
      patientId: touches.patientId,
      lastTouchAt: sql<Date | null>`max(${touches.occurredAt})`.as("last_touch_at"),
    })
    .from(touches)
    .where(inArray(touches.status, ["sent", "delivered", "answered", "left_message"]))
    .groupBy(touches.patientId)
    .as("last_touch");
}

export async function listOverdue(input: {
  locationId: string;
  visitValueCents: number;
  filters?: OverdueFilters;
  limit?: number;
  offset?: number;
  today?: Date;
}): Promise<{ rows: OverdueRow[]; total: number }> {
  const db = getDb();
  const today = input.today ?? new Date();
  const filters = input.filters ?? {};
  const lastTouch = lastTouchSubquery();
  const where = filterConditions(input.locationId, filters, today, lastTouch);

  const rows = await db
    .select({
      patient: patients,
      lastTouchAt: lastTouch.lastTouchAt,
    })
    .from(patients)
    .leftJoin(lastTouch, eq(lastTouch.patientId, patients.id))
    .where(where)
    .orderBy(asc(patients.nextDueOn), asc(patients.lastName))
    .limit(input.limit ?? 100)
    .offset(input.offset ?? 0);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(patients)
    .leftJoin(lastTouch, eq(lastTouch.patientId, patients.id))
    .where(where);

  return {
    total,
    rows: rows.map(({ patient, lastTouchAt }) => ({
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone,
      emailConsent: patient.emailConsent,
      smsConsent: patient.smsConsent,
      emailOptedOutAt: patient.emailOptedOutAt,
      smsOptedOutAt: patient.smsOptedOutAt,
      emailBouncedAt: patient.emailBouncedAt,
      phoneFailedAt: patient.phoneFailedAt,
      doNotContact: patient.doNotContact,
      recallIntervalMonths: patient.recallIntervalMonths,
      lastVisitOn: patient.lastVisitOn,
      nextDueOn: patient.nextDueOn,
      lastTouchAt: lastTouchAt ? new Date(lastTouchAt) : null,
      bucket: bucketFor(patient.nextDueOn, today),
      valueCents: input.visitValueCents,
    })),
  };
}

export interface OverdueSummary {
  /** Chase-worthy patients only (3 months past due and beyond). */
  totalPatients: number;
  totalValueCents: number;
  byBucket: Record<OverdueBucket, { patients: number; valueCents: number }>;
  /** Patients with no visit date at all — honest about what we cannot know. */
  noHistory: number;
  rosterSize: number;
}

/**
 * The number that sells the trial: how many patients are overdue and what that is
 * worth at the practice's own visit value.
 *
 * One grouped query. The `case` has to be raw SQL, so the thresholds go in as ISO
 * strings with explicit casts (see the file header).
 */
export async function overdueSummary(input: {
  locationId: string;
  visitValueCents: number;
  today?: Date;
}): Promise<OverdueSummary> {
  const db = getDb();
  const today = input.today ?? new Date();
  const { m3, m6, m12, m24 } = thresholds(today);
  const iso = (d: Date) => d.toISOString();

  const rows = await db
    .select({
      bucket: sql<string>`
        case
          when ${patients.nextDueOn} is null then 'no_history'
          when ${patients.nextDueOn} <= ${iso(m24)}::timestamptz then 'm24_plus'
          when ${patients.nextDueOn} <= ${iso(m12)}::timestamptz then 'm12_24'
          when ${patients.nextDueOn} <= ${iso(m6)}::timestamptz then 'm6_12'
          when ${patients.nextDueOn} <= ${iso(m3)}::timestamptz then 'm3_6'
          else 'current'
        end`.as("bucket"),
      count: sql<number>`count(*)::int`,
    })
    .from(patients)
    .where(and(eq(patients.locationId, input.locationId), eq(patients.status, "active")))
    .groupBy(sql`1`);

  const byBucket = Object.fromEntries(
    ALL_BUCKETS.map((b) => [b, { patients: 0, valueCents: 0 }]),
  ) as OverdueSummary["byBucket"];

  let totalPatients = 0;
  let noHistory = 0;
  let rosterSize = 0;

  for (const row of rows) {
    rosterSize += row.count;
    if (row.bucket === "no_history") {
      noHistory += row.count;
      byBucket.current.patients += row.count;
      continue;
    }
    const bucket = row.bucket as OverdueBucket;
    byBucket[bucket] = {
      patients: byBucket[bucket].patients + row.count,
      valueCents: byBucket[bucket].valueCents + row.count * input.visitValueCents,
    };
    if (bucket !== "current") totalPatients += row.count;
  }

  return {
    totalPatients,
    totalValueCents: totalPatients * input.visitValueCents,
    byBucket,
    noHistory,
    rosterSize,
  };
}

/**
 * Recompute `next_due_on`, the per-patient recall interval and the cached bucket
 * for a location's roster.
 *
 * Runs after an import commit and nightly. Reads every patient's visits in one
 * query rather than N+1, and writes only rows that actually changed — a nightly
 * job that rewrites 4,000 unchanged rows makes every `updated_at` useless.
 */
export async function recomputeOverdue(input: {
  locationId: string;
  today?: Date;
  /** Overwrite per-patient intervals inferred from history. */
  inferIntervals?: boolean;
}): Promise<{ patientsUpdated: number; rosterSize: number }> {
  const db = getDb();
  const today = input.today ?? new Date();

  const roster = await db
    .select()
    .from(patients)
    .where(and(eq(patients.locationId, input.locationId), ne(patients.status, "merged")));
  if (roster.length === 0) return { patientsUpdated: 0, rosterSize: 0 };

  const visitRows = await db
    .select({
      patientId: visits.patientId,
      visitedOn: visits.visitedOn,
      kind: visits.kind,
    })
    .from(visits)
    .innerJoin(patients, eq(visits.patientId, patients.id))
    .where(eq(patients.locationId, input.locationId))
    .orderBy(asc(visits.visitedOn));

  const byPatient = new Map<string, { visitedOn: Date; kind: "hygiene" | "other" }[]>();
  for (const v of visitRows) {
    const list = byPatient.get(v.patientId) ?? [];
    list.push({ visitedOn: v.visitedOn, kind: v.kind });
    byPatient.set(v.patientId, list);
  }

  let patientsUpdated = 0;
  for (const patient of roster) {
    const history = byPatient.get(patient.id) ?? [];
    const interval = input.inferIntervals
      ? (inferRecallInterval(history, today) ?? patient.recallIntervalMonths)
      : patient.recallIntervalMonths;
    const due = computeNextDue(history, interval, today);
    const bucket = bucketFor(due.nextDueOn, today);

    const changed =
      sameDay(patient.lastVisitOn, due.lastVisitOn) === false ||
      sameDay(patient.nextDueOn, due.nextDueOn) === false ||
      patient.overdueBucket !== bucket ||
      patient.recallIntervalMonths !== interval;
    if (!changed) continue;

    await db
      .update(patients)
      .set({
        lastVisitOn: due.lastVisitOn,
        nextDueOn: due.nextDueOn,
        overdueBucket: bucket,
        recallIntervalMonths: interval,
        updatedAt: new Date(),
      })
      .where(eq(patients.id, patient.id));
    patientsUpdated++;
  }

  return { patientsUpdated, rosterSize: roster.length };
}

function sameDay(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return toDayStart(a).getTime() === toDayStart(b).getTime();
}

/** One patient with their visit history, for the patient screen. */
export async function getPatient(input: {
  locationIds: string[];
  patientId: string;
}): Promise<{ patient: Patient; history: { visitedOn: Date; kind: "hygiene" | "other" }[] } | null> {
  const db = getDb();
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, input.patientId), inArray(patients.locationId, input.locationIds)));
  if (!patient) return null;
  const history = await db
    .select({ visitedOn: visits.visitedOn, kind: visits.kind })
    .from(visits)
    .where(eq(visits.patientId, patient.id))
    .orderBy(desc(visits.visitedOn));
  return { patient, history };
}
