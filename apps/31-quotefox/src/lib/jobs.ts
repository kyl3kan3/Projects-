/**
 * Jobs: one per prospective job, and the dashboard figures the Jobs screen shows.
 *
 * `status` here is the contractor's own funnel (open → quoted → won/lost) and is
 * moved by real events — sending a proposal quotes a job, a paid deposit wins it.
 * Nothing derives it from a timer, so it never goes stale.
 */

import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  estimateLineItems,
  estimates,
  jobs,
  proposals,
  walkthroughs,
  type Job,
  type JobStatus,
  type Organization,
  type Trade,
} from "@/db/schema";
import { audit } from "@/lib/audit";

/** Two-letter state out of a free-text address, for the deposit-cap warnings. */
export function stateFromAddress(address: string): string | null {
  const match = /,\s*([A-Za-z]{2})\s*(?:\d{5}(?:-\d{4})?)?\s*$/.exec(address.trim());
  return match ? match[1].toUpperCase() : null;
}

export interface JobInput {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  address: string;
  title: string;
  trade?: Trade;
}

export type JobResult = { ok: true; job: Job } | { ok: false; error: string };

export async function createJob(
  org: Organization,
  actorId: string,
  input: JobInput,
): Promise<JobResult> {
  if (!input.customerName.trim()) return { ok: false, error: "Whose job is it? Add a name." };
  if (!input.address.trim()) return { ok: false, error: "Add the job address." };
  if (input.customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.customerEmail.trim())) {
    return { ok: false, error: "That email address does not look right." };
  }

  const db = getDb();
  const [job] = await db
    .insert(jobs)
    .values({
      organizationId: org.id,
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail?.trim() || null,
      customerPhone: input.customerPhone?.trim() || null,
      address: input.address.trim(),
      stateCode: stateFromAddress(input.address),
      title: input.title.trim() || `${input.customerName.trim()} — walkthrough`,
      trade: input.trade ?? org.trade,
      createdBy: actorId,
    })
    .returning();
  await audit(org.id, actorId, "job_created", job.title, { address: job.address });
  return { ok: true, job };
}

export async function getJob(organizationId: string, jobId: string): Promise<Job | null> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), eq(jobs.id, jobId)));
  return job ?? null;
}

export async function setJobStatus(
  organizationId: string,
  actorId: string,
  jobId: string,
  status: JobStatus,
): Promise<void> {
  const db = getDb();
  const [job] = await db
    .update(jobs)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(jobs.organizationId, organizationId), eq(jobs.id, jobId)))
    .returning();
  if (job) await audit(organizationId, actorId, "job_status_changed", `${job.title} → ${status}`);
}

export type JobFilter = "all" | "drafts" | "sent" | "won";

export interface JobListRow {
  job: Job;
  estimateId: string | null;
  estimateStatus: string | null;
  totalCents: number;
  needsPricing: number;
  proposalId: string | null;
  proposalStatus: string | null;
  proposalSentAt: Date | null;
  proposalExpiresAt: Date | null;
  walkthroughStatus: string | null;
  walkthroughId: string | null;
}

/**
 * The Jobs screen, in one query per concern rather than one per row.
 *
 * Every column that a status pill reads is returned raw; the pill itself is
 * derived at render time (src/lib/display.ts), so a proposal that expired
 * overnight reads "EXPIRED" without waiting for a sweep to notice.
 */
export async function listJobs(
  organizationId: string,
  filter: JobFilter = "all",
): Promise<JobListRow[]> {
  const db = getDb();
  const all = await db
    .select()
    .from(jobs)
    .where(eq(jobs.organizationId, organizationId))
    .orderBy(desc(jobs.createdAt))
    .limit(200);
  if (!all.length) return [];

  const jobIds = all.map((job) => job.id);
  const estimateRows = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.organizationId, organizationId), inArray(estimates.jobId, jobIds)))
    .orderBy(estimates.version);
  const latestEstimate = new Map<string, (typeof estimateRows)[number]>();
  for (const row of estimateRows) latestEstimate.set(row.jobId, row);

  const proposalRows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.organizationId, organizationId), inArray(proposals.jobId, jobIds)))
    .orderBy(proposals.sentAt);
  const latestProposal = new Map<string, (typeof proposalRows)[number]>();
  for (const row of proposalRows) latestProposal.set(row.jobId, row);

  const walkthroughRows = await db
    .select()
    .from(walkthroughs)
    .where(
      and(eq(walkthroughs.organizationId, organizationId), inArray(walkthroughs.jobId, jobIds)),
    )
    .orderBy(walkthroughs.createdAt);
  const latestWalkthrough = new Map<string, (typeof walkthroughRows)[number]>();
  for (const row of walkthroughRows) latestWalkthrough.set(row.jobId, row);

  const flaggedCounts = await db
    .select({ estimateId: estimateLineItems.estimateId, flagged: count() })
    .from(estimateLineItems)
    .where(
      and(
        eq(estimateLineItems.organizationId, organizationId),
        eq(estimateLineItems.needsPricing, true),
      ),
    )
    .groupBy(estimateLineItems.estimateId);
  const flaggedByEstimate = new Map(
    flaggedCounts.map((row) => [row.estimateId, Number(row.flagged)]),
  );

  const rows: JobListRow[] = all.map((job) => {
    const estimate = latestEstimate.get(job.id) ?? null;
    const proposal = latestProposal.get(job.id) ?? null;
    const walkthrough = latestWalkthrough.get(job.id) ?? null;
    return {
      job,
      estimateId: estimate?.id ?? null,
      estimateStatus: estimate?.status ?? null,
      totalCents: proposal?.totalCents ?? estimate?.totalCents ?? 0,
      needsPricing: estimate ? (flaggedByEstimate.get(estimate.id) ?? 0) : 0,
      proposalId: proposal?.id ?? null,
      proposalStatus: proposal?.status ?? null,
      proposalSentAt: proposal?.sentAt ?? null,
      proposalExpiresAt: proposal?.expiresAt ?? null,
      walkthroughStatus: walkthrough?.status ?? null,
      walkthroughId: walkthrough?.id ?? null,
    };
  });

  switch (filter) {
    case "drafts":
      return rows.filter((row) => row.estimateId && !row.proposalId);
    case "sent":
      return rows.filter((row) => row.proposalId && row.job.status !== "won");
    case "won":
      return rows.filter((row) => row.job.status === "won");
    default:
      return rows;
  }
}

export interface Dashboard {
  quotedThisWeekCents: number;
  quotedThisWeekCount: number;
  /** Median minutes from walkthrough start to proposal sent, this month. */
  medianTimeToSendMinutes: number | null;
  awaitingCount: number;
  wonThisMonthCents: number;
}

/**
 * The stat band on the Jobs screen.
 *
 * The date comparisons are done with Drizzle's typed operators rather than inside
 * a raw `sql` fragment: a Date interpolated into a raw fragment skips the column
 * encoder, and postgres.js then tries to take the byte length of a Date object and
 * throws at runtime.
 */
export async function loadDashboard(organizationId: string): Promise<Dashboard> {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);

  const week = await db
    .select({ totalCents: proposals.totalCents })
    .from(proposals)
    .where(
      and(eq(proposals.organizationId, organizationId), gte(proposals.sentAt, weekAgo)),
    );

  const won = await db
    .select({ totalCents: proposals.totalCents })
    .from(proposals)
    .where(
      and(
        eq(proposals.organizationId, organizationId),
        eq(proposals.status, "deposit_paid"),
        gte(proposals.sentAt, monthAgo),
      ),
    );

  const awaiting = await db
    .select({ id: proposals.id, status: proposals.status, expiresAt: proposals.expiresAt })
    .from(proposals)
    .where(
      and(
        eq(proposals.organizationId, organizationId),
        inArray(proposals.status, ["sent", "viewed"]),
      ),
    );

  const timings = await db
    .select({
      sentAt: proposals.sentAt,
      startedAt: walkthroughs.createdAt,
    })
    .from(proposals)
    .innerJoin(estimates, eq(proposals.estimateId, estimates.id))
    .innerJoin(walkthroughs, eq(estimates.walkthroughId, walkthroughs.id))
    .where(and(eq(proposals.organizationId, organizationId), gte(proposals.sentAt, monthAgo)));

  const minutes = timings
    .map((row) => (row.sentAt.getTime() - row.startedAt.getTime()) / 60_000)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const median = minutes.length
    ? Math.round(
        minutes.length % 2
          ? minutes[(minutes.length - 1) / 2]
          : (minutes[minutes.length / 2 - 1] + minutes[minutes.length / 2]) / 2,
      )
    : null;

  const now = Date.now();
  return {
    quotedThisWeekCents: week.reduce((sum, row) => sum + row.totalCents, 0),
    quotedThisWeekCount: week.length,
    medianTimeToSendMinutes: median,
    // Expiry is derived as of now, not read from the stored status.
    awaitingCount: awaiting.filter((row) => row.expiresAt.getTime() > now).length,
    wonThisMonthCents: won.reduce((sum, row) => sum + row.totalCents, 0),
  };
}
