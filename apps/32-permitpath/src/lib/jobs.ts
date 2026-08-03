/**
 * Jobs: the org's work items, and the rollups the jobs list needs.
 *
 * Every query here is org-scoped by construction — a job id alone is never enough
 * to read a row, because the id is in the URL and the URL is guessable.
 */

import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checklistItems,
  jobs,
  jurisdictions,
  permitApplications,
  permitChecklists,
  requirementRecords,
  users,
  type ApplicationStatus,
  type Job,
  type Jurisdiction,
  type Plan,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { checklistProgress, generateChecklist } from "@/lib/checklists";
import { appError } from "@/lib/errors";
import { checkActiveJobs } from "@/lib/plans";
import { fileCoverageRequest, getCurrentRecord } from "@/lib/requirements";
import { displayStatus } from "@/lib/tracker";

export interface JobRow {
  job: Job;
  jurisdiction: Jurisdiction;
  /** Derived at read time, so a lapsed permit never reads "Issued". */
  status: ApplicationStatus;
  refNumber: string | null;
  verified: number;
  totalItems: number;
  /** The checklist is pinned to a superseded record version. */
  stale: boolean;
  assignedName: string | null;
}

export async function countActiveJobs(organizationId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ total: count() })
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), eq(jobs.status, "active")));
  return Number(row?.total ?? 0);
}

/** The jobs screen, in one pass plus three small rollup queries. */
export async function listJobs(input: {
  organizationId: string;
  status?: "active" | "closed";
  limit?: number;
}): Promise<JobRow[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobs, jurisdiction: jurisdictions, assignedName: users.name })
    .from(jobs)
    .innerJoin(jurisdictions, eq(jurisdictions.id, jobs.jurisdictionId))
    .leftJoin(users, eq(users.id, jobs.assignedUserId))
    .where(
      and(
        eq(jobs.organizationId, input.organizationId),
        input.status ? eq(jobs.status, input.status) : undefined,
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(input.limit ?? 100);

  if (rows.length === 0) return [];
  const jobIds = rows.map((r) => r.job.id);

  const checklists = await db
    .select({
      jobId: permitChecklists.jobId,
      checklistId: permitChecklists.id,
      supersededBy: requirementRecords.supersededBy,
    })
    .from(permitChecklists)
    .innerJoin(requirementRecords, eq(requirementRecords.id, permitChecklists.requirementRecordId))
    .where(inArray(permitChecklists.jobId, jobIds));

  const items = checklists.length
    ? await db
        .select({ checklistId: checklistItems.checklistId, state: checklistItems.state })
        .from(checklistItems)
        .where(
          inArray(
            checklistItems.checklistId,
            checklists.map((c) => c.checklistId),
          ),
        )
    : [];

  const applications = await db
    .select()
    .from(permitApplications)
    .where(inArray(permitApplications.jobId, jobIds))
    .orderBy(asc(permitApplications.createdAt));

  return rows.map(({ job, jurisdiction, assignedName }) => {
    const checklist = checklists.find((c) => c.jobId === job.id);
    const own = checklist ? items.filter((i) => i.checklistId === checklist.checklistId) : [];
    const progress = checklistProgress(own);
    const jobApplications = applications.filter((a) => a.jobId === job.id);
    const headline = pickHeadlineApplication(jobApplications);

    return {
      job,
      jurisdiction,
      status: headline ? displayStatus(headline) : "not_submitted",
      refNumber: headline?.jurisdictionRefNumber ?? null,
      verified: progress.verified,
      totalItems: progress.total,
      stale: Boolean(checklist?.supersededBy),
      assignedName: assignedName ?? null,
    };
  });
}

/**
 * Which application speaks for the job in a one-line row: the worst news first.
 * A stop-work order outranks an expiry, which outranks anything still in review.
 */
const STATUS_PRIORITY: ApplicationStatus[] = [
  "stop_work",
  "expired",
  "in_review",
  "not_submitted",
  "issued",
];

function pickHeadlineApplication<T extends { status: ApplicationStatus; expiresAt: Date | null }>(
  applications: T[],
): T | null {
  if (applications.length === 0) return null;
  return [...applications].sort(
    (a, b) =>
      STATUS_PRIORITY.indexOf(displayStatus(a)) - STATUS_PRIORITY.indexOf(displayStatus(b)),
  )[0];
}

export interface JobDetail {
  job: Job;
  jurisdiction: Jurisdiction;
  assignedName: string | null;
}

export async function getJob(jobId: string, organizationId: string): Promise<JobDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ job: jobs, jurisdiction: jurisdictions, assignedName: users.name })
    .from(jobs)
    .innerJoin(jurisdictions, eq(jurisdictions.id, jobs.jurisdictionId))
    .leftJoin(users, eq(users.id, jobs.assignedUserId))
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)));
  return row ? { job: row.job, jurisdiction: row.jurisdiction, assignedName: row.assignedName } : null;
}

export interface CreateJobInput {
  organizationId: string;
  plan: Plan;
  actorUserId: string;
  label: string;
  siteAddress: string;
  jurisdictionId: string;
  jobType: string;
  assignedUserId?: string | null;
  notes?: string | null;
}

export interface CreateJobResult {
  job: Job;
  checklistGenerated: boolean;
  /** Set when the pair has no verified record: we filed instead of guessing. */
  coverageRequested: boolean;
}

/**
 * Create a job and generate its checklist.
 *
 * When the (jurisdiction, job type) pair has no verified record the job is still
 * created — the work is real either way — but nothing is invented: a coverage
 * request is filed and the job screen shows the department's contact card.
 */
export async function createJob(input: CreateJobInput): Promise<CreateJobResult> {
  const label = input.label.trim();
  const siteAddress = input.siteAddress.trim();
  if (siteAddress.length < 6) throw appError("Enter the job site address");

  const used = await countActiveJobs(input.organizationId);
  const gate = checkActiveJobs(input.plan, used);
  if (!gate.allowed) throw appError(gate.message ?? "Active job limit reached on this plan");

  const db = getDb();
  const [job] = await db
    .insert(jobs)
    .values({
      organizationId: input.organizationId,
      label: label || siteAddress,
      siteAddress,
      jurisdictionId: input.jurisdictionId,
      jobType: input.jobType,
      assignedUserId: input.assignedUserId ?? null,
      notes: input.notes?.trim() || null,
    })
    .returning();

  const record = await getCurrentRecord(input.jurisdictionId, input.jobType);
  if (!record) {
    await fileCoverageRequest({
      organizationId: input.organizationId,
      jurisdictionId: input.jurisdictionId,
      jobType: input.jobType,
      note: `Requested while creating job at ${siteAddress}`,
    });
    return { job, checklistGenerated: false, coverageRequested: true };
  }

  await generateChecklist(job.id);
  await recordAudit({
    action: "job.created",
    target: `job:${job.id}`,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    metadata: { jurisdictionId: input.jurisdictionId, jobType: input.jobType },
  });

  return { job, checklistGenerated: true, coverageRequested: false };
}

export async function setJobStatus(input: {
  jobId: string;
  organizationId: string;
  status: "active" | "closed";
}): Promise<void> {
  const db = getDb();
  await db
    .update(jobs)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)));
}

export async function updateJobNotes(input: {
  jobId: string;
  organizationId: string;
  notes: string;
}): Promise<void> {
  const db = getDb();
  await db
    .update(jobs)
    .set({ notes: input.notes.trim() || null, updatedAt: new Date() })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)));
}

export async function listOrgMembers(
  organizationId: string,
): Promise<{ id: string; name: string; email: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name ?? r.email.split("@")[0], email: r.email }));
}

/** Issued permits with an expiry, for the licence screen's permit column. */
export async function expiringPermits(
  organizationId: string,
  limit = 10,
): Promise<
  { applicationId: string; jobId: string; jobLabel: string; permitName: string; expiresAt: Date }[]
> {
  const db = getDb();
  const rows = await db
    .select({
      applicationId: permitApplications.id,
      jobId: jobs.id,
      jobLabel: jobs.label,
      permitName: permitApplications.permitName,
      expiresAt: permitApplications.expiresAt,
    })
    .from(permitApplications)
    .innerJoin(jobs, eq(jobs.id, permitApplications.jobId))
    .where(
      and(
        eq(jobs.organizationId, organizationId),
        eq(permitApplications.status, "issued"),
        isNotNull(permitApplications.expiresAt),
      ),
    )
    .orderBy(asc(permitApplications.expiresAt))
    .limit(limit);
  return rows
    .filter((r): r is typeof r & { expiresAt: Date } => r.expiresAt !== null)
    .map((r) => ({ ...r, expiresAt: r.expiresAt }));
}
