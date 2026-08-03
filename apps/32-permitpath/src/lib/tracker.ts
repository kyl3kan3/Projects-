/**
 * Permit application tracking: the status timeline, its guards, and the expiry
 * rule each permit inherits from its jurisdiction.
 *
 * Two decisions worth stating out loud:
 *
 *  1. **Status is derived for display.** A permit issued 212 days ago in a
 *     jurisdiction with a 180-day life is expired, whether or not a sweep has
 *     visited the row. `displayStatus` computes that at read time; the stored
 *     column records what a human did, not what the calendar did.
 *  2. **Expiry is recomputed from the rule, not typed in.** Most valley
 *     jurisdictions restart the clock on each passed inspection, so recording an
 *     inspection result moves the expiry — which is exactly why nobody can keep
 *     this in a spreadsheet.
 */

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  inspections,
  jobs,
  jurisdictions,
  permitApplications,
  type ApplicationStatus,
  type Inspection,
  type Jurisdiction,
  type PermitApplication,
  type PermitExpiryBasis,
  type StatusEvent,
} from "@/db/schema";
import { appError } from "@/lib/errors";

const DAY_MS = 86_400_000;

/**
 * The state machine. `expired` is never a transition a person makes — it is what
 * the calendar does to an issued permit — so nothing transitions *to* it here.
 */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  not_submitted: ["in_review"],
  in_review: ["issued", "not_submitted"],
  issued: ["stop_work", "in_review"],
  expired: ["in_review"],
  stop_work: ["issued"],
};

export function allowedTransitions(from: ApplicationStatus): ApplicationStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: ApplicationStatus, to: ApplicationStatus): boolean {
  return allowedTransitions(from).includes(to);
}

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  not_submitted: "Not submitted",
  in_review: "In review",
  issued: "Issued",
  expired: "Expired",
  stop_work: "Stop-work",
};

/**
 * What the row should say right now. An issued permit past its expiry reads
 * expired even if no sweep has run; a stop-work order outranks the calendar,
 * because the crew is off the job either way and the reason matters.
 */
export function displayStatus(
  application: Pick<PermitApplication, "status" | "expiresAt">,
  now: Date = new Date(),
): ApplicationStatus {
  if (application.status === "issued" && application.expiresAt && application.expiresAt <= now) {
    return "expired";
  }
  return application.status;
}

/**
 * When a permit lapses, per the jurisdiction's own rule. `last_inspection` means
 * the clock restarts on every passed inspection — the common Arizona rule, and
 * the reason a permit can quietly outlive its original expiry.
 */
export function computeExpiry(
  basis: PermitExpiryBasis,
  validDays: number,
  issuedAt: Date,
  lastPassedInspectionAt: Date | null,
): Date {
  const anchor =
    basis === "last_inspection" && lastPassedInspectionAt && lastPassedInspectionAt > issuedAt
      ? lastPassedInspectionAt
      : issuedAt;
  return new Date(anchor.getTime() + validDays * DAY_MS);
}

/** Plain-language expiry rule, shown next to the date so the date is believable. */
export function expiryRuleLabel(jurisdiction: Pick<Jurisdiction, "permitValidDays" | "permitExpiryBasis">): string {
  return jurisdiction.permitExpiryBasis === "last_inspection"
    ? `${jurisdiction.permitValidDays} days after the last passed inspection`
    : `${jurisdiction.permitValidDays} days from issuance`;
}

export interface ApplicationWithContext {
  application: PermitApplication;
  inspections: Inspection[];
}

export async function listApplications(jobId: string): Promise<ApplicationWithContext[]> {
  const db = getDb();
  const applications = await db
    .select()
    .from(permitApplications)
    .where(eq(permitApplications.jobId, jobId))
    .orderBy(asc(permitApplications.createdAt));
  if (applications.length === 0) return [];

  const rows = await db
    .select()
    .from(inspections)
    .where(
      inArray(
        inspections.permitApplicationId,
        applications.map((a) => a.id),
      ),
    )
    .orderBy(asc(inspections.createdAt));

  return applications.map((application) => ({
    application,
    inspections: rows.filter((i) => i.permitApplicationId === application.id),
  }));
}

export async function createApplication(input: {
  jobId: string;
  permitName: string;
  refNumber?: string | null;
  actor: string;
}): Promise<PermitApplication> {
  const db = getDb();
  const event: StatusEvent = {
    status: "not_submitted",
    at: new Date().toISOString(),
    by: input.actor,
    note: "Application created",
  };
  const [row] = await db
    .insert(permitApplications)
    .values({
      jobId: input.jobId,
      permitName: input.permitName.trim(),
      jurisdictionRefNumber: input.refNumber?.trim() || null,
      status: "not_submitted",
      statusHistory: [event],
    })
    .returning();
  return row;
}

/** Advance an application, guarded, with the timeline entry and derived expiry. */
export async function transitionApplication(input: {
  applicationId: string;
  to: ApplicationStatus;
  actor: string;
  note?: string | null;
  refNumber?: string | null;
}): Promise<PermitApplication> {
  const db = getDb();
  const [row] = await db
    .select({ application: permitApplications, job: jobs, jurisdiction: jurisdictions })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .innerJoin(jurisdictions, eq(jurisdictions.id, jobs.jurisdictionId))
    .where(eq(permitApplications.id, input.applicationId));
  if (!row) throw appError("That permit application could not be found");

  const from = row.application.status;
  if (!canTransition(from, input.to)) {
    throw appError(`A ${STATUS_LABEL[from].toLowerCase()} permit cannot move to ${STATUS_LABEL[input.to].toLowerCase()}`);
  }

  const now = new Date();
  const history: StatusEvent[] = [
    ...row.application.statusHistory,
    { status: input.to, at: now.toISOString(), by: input.actor, note: input.note?.trim() || undefined },
  ];

  const patch: Partial<typeof permitApplications.$inferInsert> = {
    status: input.to,
    statusHistory: history,
    updatedAt: sql`now()`,
  };
  if (input.refNumber !== undefined && input.refNumber !== null && input.refNumber.trim()) {
    patch.jurisdictionRefNumber = input.refNumber.trim();
  }

  if (input.to === "in_review" && !row.application.submittedAt) patch.submittedAt = now;
  if (input.to === "issued") {
    const issuedAt = row.application.issuedAt ?? now;
    patch.issuedAt = issuedAt;
    patch.expiresAt = computeExpiry(
      row.jurisdiction.permitExpiryBasis,
      row.jurisdiction.permitValidDays,
      issuedAt,
      await lastPassedInspectionAt(input.applicationId),
    );
  }
  if (input.to === "not_submitted") {
    patch.submittedAt = null;
    patch.issuedAt = null;
    patch.expiresAt = null;
  }

  const [updated] = await db
    .update(permitApplications)
    .set(patch)
    .where(eq(permitApplications.id, input.applicationId))
    .returning();
  return updated;
}

async function lastPassedInspectionAt(applicationId: string): Promise<Date | null> {
  const db = getDb();
  const [row] = await db
    .select({ completedAt: inspections.completedAt })
    .from(inspections)
    .where(and(eq(inspections.permitApplicationId, applicationId), eq(inspections.result, "passed")))
    .orderBy(desc(inspections.completedAt))
    .limit(1);
  return row?.completedAt ?? null;
}

export async function addInspection(input: {
  applicationId: string;
  inspectionType: string;
  scheduledFor?: Date | null;
  contactNotes?: string | null;
  leadTimeDays?: number | null;
  reinspectionFeeCents?: number | null;
}): Promise<Inspection> {
  const db = getDb();
  const [row] = await db
    .insert(inspections)
    .values({
      permitApplicationId: input.applicationId,
      inspectionType: input.inspectionType.trim(),
      scheduledFor: input.scheduledFor ?? null,
      contactNotes: input.contactNotes?.trim() || null,
      leadTimeDays: input.leadTimeDays ?? null,
      reinspectionFeeCents: input.reinspectionFeeCents ?? null,
    })
    .returning();
  return row;
}

/**
 * Record an inspection result. A pass in a `last_inspection` jurisdiction pushes
 * the permit's expiry out, so the application is re-derived here rather than
 * waiting for a nightly sweep to notice.
 */
export async function recordInspectionResult(input: {
  inspectionId: string;
  result: "passed" | "failed";
}): Promise<{ inspection: Inspection; application: PermitApplication }> {
  const db = getDb();
  const [existing] = await db.select().from(inspections).where(eq(inspections.id, input.inspectionId));
  if (!existing) throw appError("That inspection could not be found");

  const [inspection] = await db
    .update(inspections)
    .set({ result: input.result, completedAt: sql`now()` })
    .where(eq(inspections.id, input.inspectionId))
    .returning();

  const [row] = await db
    .select({ application: permitApplications, job: jobs, jurisdiction: jurisdictions })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .innerJoin(jurisdictions, eq(jurisdictions.id, jobs.jurisdictionId))
    .where(eq(permitApplications.id, existing.permitApplicationId));
  if (!row) throw appError("That permit application could not be found");

  let application = row.application;
  if (application.status === "issued" && application.issuedAt) {
    const expiresAt = computeExpiry(
      row.jurisdiction.permitExpiryBasis,
      row.jurisdiction.permitValidDays,
      application.issuedAt,
      await lastPassedInspectionAt(application.id),
    );
    const [updated] = await db
      .update(permitApplications)
      .set({ expiresAt, updatedAt: sql`now()` })
      .where(eq(permitApplications.id, application.id))
      .returning();
    application = updated;
  }

  return { inspection, application };
}
