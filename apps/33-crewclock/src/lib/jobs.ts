/**
 * Job and job-site queries, plus the database side of the cost rollup. The
 * arithmetic itself lives in src/lib/job-costing.ts and is tested there.
 */

import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  crewAssignments,
  jobSites,
  jobs,
  timeEntries,
  users,
  type Job,
  type JobSite,
  type JobStatus,
  type Organization,
  type TimeEntry,
} from "@/db/schema";
import { projectFinish, rollupEntries, type FinishProjection, type JobCostRollup } from "@/lib/job-costing";
import { localDateKey } from "@/lib/time";

export interface JobWithSite {
  job: Job;
  site: JobSite | null;
}

export async function listJobs(organizationId: string): Promise<JobWithSite[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobs, site: jobSites })
    .from(jobs)
    .leftJoin(jobSites, eq(jobSites.id, jobs.jobSiteId))
    .where(and(eq(jobs.organizationId, organizationId), ne(jobs.status, "archived")))
    .orderBy(desc(jobs.createdAt));
  return rows.map((r) => ({ job: r.job, site: r.site ?? null }));
}

export async function getJob(organizationId: string, jobId: string): Promise<JobWithSite | null> {
  const db = getDb();
  const [row] = await db
    .select({ job: jobs, site: jobSites })
    .from(jobs)
    .leftJoin(jobSites, eq(jobSites.id, jobs.jobSiteId))
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)));
  if (!row) return null;
  return { job: row.job, site: row.site ?? null };
}

export async function listSites(organizationId: string): Promise<JobSite[]> {
  const db = getDb();
  return db
    .select()
    .from(jobSites)
    .where(eq(jobSites.organizationId, organizationId))
    .orderBy(asc(jobSites.label));
}

/* ------------------------------------------------------------ assignments --- */

export async function assignCrew(jobId: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(crewAssignments)
    .values({ jobId, userId })
    .onConflictDoUpdate({
      target: [crewAssignments.jobId, crewAssignments.userId],
      set: { removedAt: null, assignedAt: new Date() },
    });
}

export async function unassignCrew(jobId: string, userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(crewAssignments)
    .set({ removedAt: new Date() })
    .where(and(eq(crewAssignments.jobId, jobId), eq(crewAssignments.userId, userId)));
}

export async function assignedUserIds(jobId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ userId: crewAssignments.userId })
    .from(crewAssignments)
    .where(and(eq(crewAssignments.jobId, jobId), isNull(crewAssignments.removedAt)));
  return rows.map((r) => r.userId);
}

/** The jobs a crew member may punch into: assigned, and not finished. */
export async function jobsForCrew(userId: string): Promise<JobWithSite[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobs, site: jobSites })
    .from(crewAssignments)
    .innerJoin(jobs, eq(jobs.id, crewAssignments.jobId))
    .leftJoin(jobSites, eq(jobSites.id, jobs.jobSiteId))
    .where(
      and(
        eq(crewAssignments.userId, userId),
        isNull(crewAssignments.removedAt),
        eq(jobs.status, "active"),
      ),
    )
    .orderBy(asc(jobs.name));
  return rows.map((r) => ({ job: r.job, site: r.site ?? null }));
}

/** Everything the owner can punch into — they are not assignment-gated. */
export async function activeJobs(organizationId: string): Promise<JobWithSite[]> {
  const db = getDb();
  const rows = await db
    .select({ job: jobs, site: jobSites })
    .from(jobs)
    .leftJoin(jobSites, eq(jobSites.id, jobs.jobSiteId))
    .where(and(eq(jobs.organizationId, organizationId), eq(jobs.status, "active")))
    .orderBy(asc(jobs.name));
  return rows.map((r) => ({ job: r.job, site: r.site ?? null }));
}

export async function crewForJob(jobId: string) {
  const db = getDb();
  return db
    .select({ user: users, assignment: crewAssignments })
    .from(crewAssignments)
    .innerJoin(users, eq(users.id, crewAssignments.userId))
    .where(and(eq(crewAssignments.jobId, jobId), isNull(crewAssignments.removedAt)))
    .orderBy(asc(users.name));
}

/* ---------------------------------------------------------------- costing --- */

export interface JobCost {
  rollup: JobCostRollup;
  projection: FinishProjection;
}

async function entriesForJob(jobId: string): Promise<TimeEntry[]> {
  const db = getDb();
  return db.select().from(timeEntries).where(eq(timeEntries.jobId, jobId));
}

export async function jobCost(
  job: Job,
  org: Organization,
  now: Date = new Date(),
): Promise<JobCost> {
  const entries = await entriesForJob(job.id);
  const rollup = rollupEntries(entries, job, now);
  const days = new Set(entries.map((e) => localDateKey(e.clockInAt, org.timezone)));
  return { rollup, projection: projectFinish(rollup, { basisDays: days.size }) };
}

/** One pass for the jobs list, so the screen is a single round trip per job. */
export async function jobCosts(
  jobList: Job[],
  org: Organization,
  now: Date = new Date(),
): Promise<Map<string, JobCost>> {
  const out = new Map<string, JobCost>();
  for (const job of jobList) out.set(job.id, await jobCost(job, org, now));
  return out;
}

export async function setJobStatus(
  organizationId: string,
  jobId: string,
  status: JobStatus,
): Promise<void> {
  const db = getDb();
  await db
    .update(jobs)
    .set({ status })
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)));
}
