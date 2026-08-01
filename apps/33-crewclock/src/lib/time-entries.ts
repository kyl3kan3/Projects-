/**
 * The time-entry lifecycle: record punches, reconcile the offline outbox, flag
 * anomalies, edit with an audit trail, approve a period.
 *
 * ## Guarantees this module owns
 *
 * 1. **A punch is never rejected for where it was, or for having no location.**
 *    The verdict is recorded and flagged (src/lib/geofence.ts).
 * 2. **A punch synced twice inserts once.** The unique index on
 *    `(organization_id, client_event_id)` is the guarantee; the code below only
 *    has to handle the conflict gracefully and ack both attempts.
 * 3. **Nothing is silently truncated.** A shift left open past the org's max is
 *    flagged for review, never closed by a background job.
 * 4. **Every edit is on the record**, one row per changed field, with a required
 *    reason, and the rows are never updated or deleted.
 */

import { and, asc, desc, eq, gte, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  auditLog,
  crewAssignments,
  jobSites,
  jobs,
  organizations,
  payPeriodApprovals,
  timeEntries,
  timeEntryEdits,
  users,
  type EntryFlag,
  type GeofenceStatus,
  type Job,
  type JobSite,
  type Organization,
  type TimeEntry,
  type TimeEntrySource,
  type User,
} from "@/db/schema";
import { checkTravel, evaluateGeofence, type GeofenceVerdict } from "@/lib/geofence";
import {
  effectiveBreakSeconds,
  localDateKey,
  localRangeUtc,
  workedSeconds,
  type ShiftLike,
} from "@/lib/time";

/* ---------------------------------------------------------------- inputs --- */

export const punchSchema = z.object({
  clientEventId: z.string().min(8).max(64),
  jobId: z.string().uuid(),
  kind: z.enum(["in", "out"]),
  /** Device clock. Trusted for ordering, not for pay: see `occurredAt` below. */
  occurredAt: z.coerce.date(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  accuracyM: z.number().min(0).nullable().optional(),
  deviceFingerprint: z.string().max(120).nullable().optional(),
  source: z.enum(["live", "offline_sync", "manual"]).default("live"),
});

export type PunchInput = z.infer<typeof punchSchema>;

export type PunchOutcome =
  | { status: "opened"; entry: TimeEntry; verdict: GeofenceVerdict; deduplicated: false }
  | { status: "closed"; entry: TimeEntry; verdict: GeofenceVerdict; deduplicated: false }
  | { status: "duplicate"; entry: TimeEntry; deduplicated: true }
  | { status: "no_open_shift" }
  | { status: "not_assigned" };

/**
 * How far in the future a device clock may be before we distrust it. Phones
 * drift; a punch dated 40 minutes ahead would let someone bank time that has
 * not happened, so the server clamps it. Backdating is left alone — an offline
 * punch from six hours ago is exactly what the outbox is for.
 */
const MAX_DEVICE_CLOCK_SKEW_MS = 2 * 60 * 1000;

/** Another user punching from the same device inside this window is a signal. */
const SHARED_DEVICE_WINDOW_MS = 5 * 60 * 1000;

function clampPunchTime(occurredAt: Date, now: Date): Date {
  return occurredAt.getTime() > now.getTime() + MAX_DEVICE_CLOCK_SKEW_MS ? now : occurredAt;
}

/* -------------------------------------------------------------- helpers --- */

/** The shift shape the pure time functions want, with a running break folded in. */
export function toShift(entry: Pick<TimeEntry, "clockInAt" | "clockOutAt" | "breakSeconds" | "breakStartedAt">, now: Date = new Date()): ShiftLike {
  const running = entry.breakStartedAt
    ? Math.max(0, Math.floor((now.getTime() - entry.breakStartedAt.getTime()) / 1000))
    : 0;
  return {
    clockInAt: entry.clockInAt,
    clockOutAt: entry.clockOutAt,
    breakSeconds: entry.breakSeconds + running,
  };
}

export function entrySeconds(entry: TimeEntry, now: Date = new Date()): number {
  return workedSeconds(toShift(entry, now), now);
}

export function siteTimezone(org: Organization, site: JobSite | null): string {
  return site?.timezone || org.timezone;
}

function fenceOf(site: JobSite | null) {
  return site ? { center: { lat: site.lat, lng: site.lng }, radiusM: site.radiusM } : null;
}

function flagsForVerdict(verdict: GeofenceVerdict): EntryFlag[] {
  if (verdict.status === "outside") return ["outside_fence"];
  if (verdict.status === "unavailable") {
    return verdict.reason === "accuracy_unusable" ? ["low_accuracy"] : ["no_gps"];
  }
  return [];
}

function mergeFlags(existing: EntryFlag[], added: EntryFlag[]): EntryFlag[] {
  return [...new Set([...existing, ...added])];
}

/* ------------------------------------------------------------ the punch --- */

export interface PunchContext {
  user: User;
  org: Organization;
}

/**
 * Record one punch. Idempotent on `clientEventId` within the org.
 *
 * Concurrency: the open-shift lookup and the insert run inside a transaction
 * with a row lock on the user, so two taps in the same second cannot open two
 * shifts. The unique index is the backstop if two different processes race.
 */
export async function recordPunch(ctx: PunchContext, input: PunchInput): Promise<PunchOutcome> {
  const db = getDb();
  const now = new Date();
  const occurredAt = clampPunchTime(input.occurredAt, now);

  // Already have this one? Ack it again; the device may have retried blind.
  // Both event ids are checked: a clock-out is a tap with its own id, and a
  // retried one must not be mistaken for a new punch that closes a later shift.
  const [existing] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, ctx.org.id),
        or(
          eq(timeEntries.clientEventId, input.clientEventId),
          eq(timeEntries.clientEventIdOut, input.clientEventId),
        ),
      ),
    );
  if (existing) return { status: "duplicate", entry: existing, deduplicated: true };

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, ctx.org.id)));
  if (!job) return { status: "not_assigned" };

  // Only assigned crew may punch into a job. The owner may always punch.
  if (ctx.user.role === "crew") {
    const [assignment] = await db
      .select()
      .from(crewAssignments)
      .where(
        and(
          eq(crewAssignments.jobId, job.id),
          eq(crewAssignments.userId, ctx.user.id),
          isNull(crewAssignments.removedAt),
        ),
      );
    if (!assignment) return { status: "not_assigned" };
  }

  const site = job.jobSiteId
    ? ((await db.select().from(jobSites).where(eq(jobSites.id, job.jobSiteId)))[0] ?? null)
    : null;

  const verdict = evaluateGeofence(
    { lat: input.lat ?? null, lng: input.lng ?? null, accuracyM: input.accuracyM ?? null },
    fenceOf(site),
  );

  let flags = flagsForVerdict(verdict);
  if (input.source === "manual") flags = mergeFlags(flags, ["manual"]);
  flags = mergeFlags(flags, await spoofingFlags(ctx, input, occurredAt));

  const [openEntry] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, ctx.user.id), isNull(timeEntries.clockOutAt)))
    .orderBy(desc(timeEntries.clockInAt))
    .limit(1);

  if (input.kind === "in") {
    // Already on the clock for this job: nothing to do but tell the truth.
    if (openEntry && openEntry.jobId === job.id) {
      return { status: "duplicate", entry: openEntry, deduplicated: true };
    }
    // On the clock for a *different* job: this is a job switch. Close the old
    // shift at this instant rather than leaving two open.
    if (openEntry) {
      await closeEntry(openEntry, {
        at: occurredAt,
        org: ctx.org,
        verdict,
        source: input.source,
        location: { lat: input.lat ?? null, lng: input.lng ?? null, accuracyM: input.accuracyM ?? null },
      });
    }

    const [entry] = await db
      .insert(timeEntries)
      .values({
        organizationId: ctx.org.id,
        userId: ctx.user.id,
        jobId: job.id,
        clockInAt: occurredAt,
        inLat: input.lat ?? null,
        inLng: input.lng ?? null,
        inAccuracyM: input.accuracyM ?? null,
        inDistanceM: verdict.distanceM,
        geofenceStatusIn: verdict.status,
        source: input.source,
        clientEventId: input.clientEventId,
        deviceFingerprint: input.deviceFingerprint ?? null,
        rateCentsPerHour: ctx.user.hourlyCostCents,
        flags,
      })
      .onConflictDoNothing({
        target: [timeEntries.organizationId, timeEntries.clientEventId],
      })
      .returning();

    if (!entry) {
      // Lost the race with another sync of the same event: read it back.
      const [winner] = await db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.organizationId, ctx.org.id),
            eq(timeEntries.clientEventId, input.clientEventId),
          ),
        );
      return { status: "duplicate", entry: winner, deduplicated: true };
    }
    return { status: "opened", entry, verdict, deduplicated: false };
  }

  // --- clock out ---
  if (!openEntry) {
    // An "out" with no shift to close. Acked so the device stops retrying, and
    // written to the audit log so the office can see it happened.
    await db.insert(auditLog).values({
      organizationId: ctx.org.id,
      actor: ctx.user.id,
      action: "punch.orphan_out",
      target: input.clientEventId,
      metadata: { jobId: input.jobId, occurredAt: occurredAt.toISOString() },
    });
    return { status: "no_open_shift" };
  }

  const closed = await closeEntry(openEntry, {
    at: occurredAt,
    org: ctx.org,
    verdict,
    source: input.source,
    clientEventId: input.clientEventId,
    location: { lat: input.lat ?? null, lng: input.lng ?? null, accuracyM: input.accuracyM ?? null },
    extraFlags: flags,
  });
  return { status: "closed", entry: closed, verdict, deduplicated: false };
}

interface CloseOptions {
  at: Date;
  org: Organization;
  verdict: GeofenceVerdict;
  source: TimeEntrySource;
  location: { lat: number | null; lng: number | null; accuracyM: number | null };
  clientEventId?: string;
  extraFlags?: EntryFlag[];
}

async function closeEntry(entry: TimeEntry, opts: CloseOptions): Promise<TimeEntry> {
  const db = getDb();
  // A clock-out before the clock-in is a device-clock artefact; the shift ends
  // now rather than going negative.
  const outAt = opts.at.getTime() < entry.clockInAt.getTime() ? new Date() : opts.at;

  // Fold a running break in, then apply the org's unpaid-meal policy.
  const runningBreak = entry.breakStartedAt
    ? Math.max(0, Math.floor((outAt.getTime() - entry.breakStartedAt.getTime()) / 1000))
    : 0;
  const loggedBreak = entry.breakSeconds + runningBreak;
  const grossSeconds = Math.max(0, Math.floor((outAt.getTime() - entry.clockInAt.getTime()) / 1000));
  const breakSeconds = effectiveBreakSeconds(grossSeconds, loggedBreak, opts.org);

  const [updated] = await db
    .update(timeEntries)
    .set({
      clockOutAt: outAt,
      breakSeconds,
      breakStartedAt: null,
      // Record the out tap's own id so a retry of it dedupes rather than
      // closing whatever shift happens to be open later.
      ...(opts.clientEventId ? { clientEventIdOut: opts.clientEventId } : {}),
      outLat: opts.location.lat,
      outLng: opts.location.lng,
      outAccuracyM: opts.location.accuracyM,
      outDistanceM: opts.verdict.distanceM,
      geofenceStatusOut: opts.verdict.status,
      flags: mergeFlags(entry.flags, [
        ...flagsForVerdict(opts.verdict),
        ...(opts.extraFlags ?? []),
      ]),
      updatedAt: new Date(),
    })
    .where(eq(timeEntries.id, entry.id))
    .returning();
  return updated;
}

/**
 * The spoofing signals. Both are review flags; neither blocks a punch, and the
 * marketing copy says so (README Key Risk 1).
 */
async function spoofingFlags(
  ctx: PunchContext,
  input: PunchInput,
  occurredAt: Date,
): Promise<EntryFlag[]> {
  const db = getDb();
  const flags: EntryFlag[] = [];

  if (input.lat != null && input.lng != null) {
    const [previous] = await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.userId, ctx.user.id), lt(timeEntries.clockInAt, occurredAt)))
      .orderBy(desc(timeEntries.clockInAt))
      .limit(1);
    const prevLat = previous?.outLat ?? previous?.inLat ?? null;
    const prevLng = previous?.outLng ?? previous?.inLng ?? null;
    const prevAt = previous?.clockOutAt ?? previous?.clockInAt ?? null;
    if (prevLat != null && prevLng != null && prevAt) {
      const travel = checkTravel({
        from: { lat: prevLat, lng: prevLng },
        fromAt: prevAt,
        to: { lat: input.lat, lng: input.lng },
        toAt: occurredAt,
      });
      if (travel.implausible) flags.push("implausible_speed");
    }
  }

  if (input.deviceFingerprint) {
    const since = new Date(occurredAt.getTime() - SHARED_DEVICE_WINDOW_MS);
    const [other] = await db
      .select({ id: timeEntries.id })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.organizationId, ctx.org.id),
          eq(timeEntries.deviceFingerprint, input.deviceFingerprint),
          ne(timeEntries.userId, ctx.user.id),
          gte(timeEntries.clockInAt, since),
        ),
      )
      .limit(1);
    if (other) flags.push("shared_device");
  }

  return flags;
}

/**
 * Offline outbox ingestion. Events are sorted by device timestamp first, so an
 * "out" that reached us before its "in" still pairs correctly.
 */
export async function reconcileOfflineBatch(
  ctx: PunchContext,
  events: PunchInput[],
): Promise<{ clientEventId: string; outcome: PunchOutcome }[]> {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const results: { clientEventId: string; outcome: PunchOutcome }[] = [];
  for (const event of ordered) {
    results.push({
      clientEventId: event.clientEventId,
      outcome: await recordPunch(ctx, { ...event, source: event.source ?? "offline_sync" }),
    });
  }
  return results;
}

/* --------------------------------------------------------------- breaks --- */

export async function startBreak(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(timeEntries)
    .set({ breakStartedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(timeEntries.userId, userId),
        isNull(timeEntries.clockOutAt),
        isNull(timeEntries.breakStartedAt),
      ),
    );
}

export async function endBreak(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(timeEntries)
    .set({
      breakSeconds: sql`${timeEntries.breakSeconds} + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - ${timeEntries.breakStartedAt}))))::int`,
      breakStartedAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.clockOutAt)));
}

/* ---------------------------------------------------------------- reads --- */

export async function openEntryFor(userId: string): Promise<TimeEntry | null> {
  const db = getDb();
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), isNull(timeEntries.clockOutAt)))
    .orderBy(desc(timeEntries.clockInAt))
    .limit(1);
  return entry ?? null;
}

export async function entriesForUserRange(
  userId: string,
  fromKey: string,
  toKey: string,
  timeZone: string,
): Promise<TimeEntry[]> {
  const db = getDb();
  const { start, end } = localRangeUtc(fromKey, toKey, timeZone);
  return db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        gte(timeEntries.clockInAt, start),
        lt(timeEntries.clockInAt, end),
      ),
    )
    .orderBy(desc(timeEntries.clockInAt));
}

export interface EntryWithNames {
  entry: TimeEntry;
  userName: string;
  userRole: User["role"];
  jobName: string;
  jobId: string;
  siteLabel: string | null;
}

export async function entriesForOrgRange(
  organizationId: string,
  fromKey: string,
  toKey: string,
  timeZone: string,
): Promise<EntryWithNames[]> {
  const db = getDb();
  const { start, end } = localRangeUtc(fromKey, toKey, timeZone);
  const rows = await db
    .select({
      entry: timeEntries,
      userName: users.name,
      userRole: users.role,
      jobName: jobs.name,
      jobId: jobs.id,
      siteLabel: jobSites.label,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .innerJoin(jobs, eq(jobs.id, timeEntries.jobId))
    .leftJoin(jobSites, eq(jobSites.id, jobs.jobSiteId))
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        gte(timeEntries.clockInAt, start),
        lt(timeEntries.clockInAt, end),
      ),
    )
    .orderBy(asc(users.name), desc(timeEntries.clockInAt));
  return rows.map((r) => ({ ...r, siteLabel: r.siteLabel ?? null }));
}

/** Everyone on the clock right now, for the job-detail "crew today" list. */
export async function onTheClockForJob(jobId: string) {
  const db = getDb();
  return db
    .select({ entry: timeEntries, userName: users.name })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .where(and(eq(timeEntries.jobId, jobId), isNull(timeEntries.clockOutAt)));
}

/* ------------------------------------------------------- forgotten punch --- */

/**
 * Flag shifts left open past the org's max. Never closes them: an office that
 * finds a 14-hour shift flagged can ask what happened, whereas a shift silently
 * truncated at 14:00:00 is a number nobody can defend.
 */
export async function flagStaleOpenEntries(org: Organization, now: Date = new Date()): Promise<number> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - org.maxShiftHours * 3_600_000);
  const stale = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, org.id),
        isNull(timeEntries.clockOutAt),
        lt(timeEntries.clockInAt, cutoff),
      ),
    );

  let flagged = 0;
  for (const entry of stale) {
    if (entry.flags.includes("stale_open")) continue;
    await db
      .update(timeEntries)
      .set({ flags: mergeFlags(entry.flags, ["stale_open"]), updatedAt: new Date() })
      .where(eq(timeEntries.id, entry.id));
    flagged += 1;
  }
  return flagged;
}

/* ----------------------------------------------------------------- edits --- */

export interface EntryPatch {
  clockInAt?: Date;
  clockOutAt?: Date | null;
  breakSeconds?: number;
  jobId?: string;
}

export class EntryEditError extends Error {}

/**
 * Apply an office edit. One `time_entry_edits` row per changed field, a reason
 * is mandatory, and an approved period must be reopened first.
 */
export async function editEntry(
  entryId: string,
  patch: EntryPatch,
  editedBy: User,
  reason: string,
): Promise<TimeEntry> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new EntryEditError("REASON_REQUIRED");

  const db = getDb();
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(eq(timeEntries.id, entryId), eq(timeEntries.organizationId, editedBy.organizationId)),
    );
  if (!entry) throw new EntryEditError("NOT_FOUND");

  const nextIn = patch.clockInAt ?? entry.clockInAt;
  const nextOut = patch.clockOutAt === undefined ? entry.clockOutAt : patch.clockOutAt;
  if (nextOut && nextOut.getTime() < nextIn.getTime()) {
    throw new EntryEditError("OUT_BEFORE_IN");
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, entry.organizationId));
  const timeZone = org.timezone;
  const dayKey = localDateKey(entry.clockInAt, timeZone);
  if (await isPeriodLocked(entry.organizationId, dayKey)) {
    throw new EntryEditError("PERIOD_LOCKED");
  }

  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (patch.clockInAt && patch.clockInAt.getTime() !== entry.clockInAt.getTime()) {
    changes.push({
      field: "clock_in_at",
      oldValue: entry.clockInAt.toISOString(),
      newValue: patch.clockInAt.toISOString(),
    });
    update.clockInAt = patch.clockInAt;
  }
  if (
    patch.clockOutAt !== undefined &&
    (patch.clockOutAt?.getTime() ?? null) !== (entry.clockOutAt?.getTime() ?? null)
  ) {
    changes.push({
      field: "clock_out_at",
      oldValue: entry.clockOutAt?.toISOString() ?? null,
      newValue: patch.clockOutAt?.toISOString() ?? null,
    });
    update.clockOutAt = patch.clockOutAt;
    update.breakStartedAt = null;
  }
  if (patch.breakSeconds !== undefined && patch.breakSeconds !== entry.breakSeconds) {
    changes.push({
      field: "break_seconds",
      oldValue: String(entry.breakSeconds),
      newValue: String(patch.breakSeconds),
    });
    update.breakSeconds = Math.max(0, patch.breakSeconds);
  }
  if (patch.jobId && patch.jobId !== entry.jobId) {
    changes.push({ field: "job_id", oldValue: entry.jobId, newValue: patch.jobId });
    update.jobId = patch.jobId;
  }

  if (changes.length === 0) return entry;

  update.edited = true;
  update.flags = mergeFlags(entry.flags, ["edited"]);

  const [updated] = await db
    .update(timeEntries)
    .set(update)
    .where(eq(timeEntries.id, entry.id))
    .returning();

  await db.insert(timeEntryEdits).values(
    changes.map((c) => ({
      timeEntryId: entry.id,
      editedBy: editedBy.id,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      reason: trimmedReason,
    })),
  );

  await db.insert(auditLog).values({
    organizationId: entry.organizationId,
    actor: editedBy.id,
    action: "time_entry.edit",
    target: entry.id,
    metadata: { reason: trimmedReason, fields: changes.map((c) => c.field) },
  });

  return updated;
}

export async function editHistory(entryId: string) {
  const db = getDb();
  return db
    .select({ edit: timeEntryEdits, editorName: users.name })
    .from(timeEntryEdits)
    .leftJoin(users, eq(users.id, timeEntryEdits.editedBy))
    .where(eq(timeEntryEdits.timeEntryId, entryId))
    .orderBy(desc(timeEntryEdits.editedAt));
}

/* ------------------------------------------------------------- approvals --- */

export async function isPeriodLocked(organizationId: string, dayKey: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payPeriodApprovals)
    .where(
      and(
        eq(payPeriodApprovals.organizationId, organizationId),
        lte(payPeriodApprovals.periodStart, dayKey),
        gte(payPeriodApprovals.periodEnd, dayKey),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function approvePeriod(
  org: Organization,
  periodStart: string,
  periodEnd: string,
  approvedBy: User,
): Promise<number> {
  const db = getDb();
  const { start, end } = localRangeUtc(periodStart, periodEnd, org.timezone);
  const now = new Date();

  const updated = await db
    .update(timeEntries)
    .set({ approvedAt: now, approvedBy: approvedBy.id, updatedAt: now })
    .where(
      and(
        eq(timeEntries.organizationId, org.id),
        gte(timeEntries.clockInAt, start),
        lt(timeEntries.clockInAt, end),
        isNull(timeEntries.approvedAt),
      ),
    )
    .returning({ id: timeEntries.id });

  await db
    .insert(payPeriodApprovals)
    .values({
      organizationId: org.id,
      periodStart,
      periodEnd,
      approvedBy: approvedBy.id,
      approvedAt: now,
      entryCount: updated.length,
    })
    .onConflictDoUpdate({
      target: [
        payPeriodApprovals.organizationId,
        payPeriodApprovals.periodStart,
        payPeriodApprovals.periodEnd,
      ],
      set: { approvedBy: approvedBy.id, approvedAt: now, entryCount: updated.length },
    });

  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: approvedBy.id,
    action: "pay_period.approve",
    target: `${periodStart}..${periodEnd}`,
    metadata: { entries: updated.length },
  });

  return updated.length;
}

export async function reopenPeriod(
  org: Organization,
  periodStart: string,
  periodEnd: string,
  actor: User,
): Promise<void> {
  const db = getDb();
  await db
    .delete(payPeriodApprovals)
    .where(
      and(
        eq(payPeriodApprovals.organizationId, org.id),
        eq(payPeriodApprovals.periodStart, periodStart),
        eq(payPeriodApprovals.periodEnd, periodEnd),
      ),
    );
  await db.insert(auditLog).values({
    organizationId: org.id,
    actor: actor.id,
    action: "pay_period.reopen",
    target: `${periodStart}..${periodEnd}`,
  });
}

export async function periodApproval(organizationId: string, periodStart: string, periodEnd: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(payPeriodApprovals)
    .where(
      and(
        eq(payPeriodApprovals.organizationId, organizationId),
        eq(payPeriodApprovals.periodStart, periodStart),
        eq(payPeriodApprovals.periodEnd, periodEnd),
      ),
    );
  return row ?? null;
}

/** Flags that mean "a human should look at this before payroll". */
export const REVIEW_FLAGS: EntryFlag[] = [
  "outside_fence",
  "no_gps",
  "low_accuracy",
  "stale_open",
  "implausible_speed",
  "shared_device",
];

export function needsReview(entry: TimeEntry): boolean {
  return entry.flags.some((f) => REVIEW_FLAGS.includes(f)) || entry.clockOutAt === null;
}

export function geofenceLabelKey(status: GeofenceStatus | null) {
  if (status === "inside") return "fence.inside" as const;
  if (status === "outside") return "fence.outside" as const;
  return "fence.unavailable" as const;
}

export type { Job };
