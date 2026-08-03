/**
 * The job queue.
 *
 * Three callers drain the same queue through `runJobs`: the browser right after an
 * upload (`/api/jobs/run`, scoped to the caller's own org), the scheduled sweep
 * (`/api/cron/tick`), and `npm run worker` if a long-lived process is deployed. One
 * code path, so a bug cannot exist in only one of them.
 *
 * **Claiming is done by Postgres.** The `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP
 * LOCKED)` pattern below hands each job to exactly one worker, and `run_at <= now()`
 * is evaluated inside the database. Comparing a JavaScript `Date` against a
 * `timestamptz` written by SQL `now()` is a trap: JS truncates to milliseconds while
 * Postgres keeps microseconds, so a row can look due and then never be claimed — a
 * queue that silently stops.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobs, type Job, type JobKind } from "@/db/schema";

export interface EnqueueInput {
  organizationId: string;
  kind: JobKind;
  payload: Record<string, string>;
  /** Seconds from now. Default: immediately. */
  delaySeconds?: number;
  maxAttempts?: number;
}

export async function enqueue(input: EnqueueInput): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(jobs)
    .values({
      organizationId: input.organizationId,
      kind: input.kind,
      payload: input.payload,
      maxAttempts: input.maxAttempts ?? 3,
      // Interval arithmetic in SQL, so the delay is relative to the database clock.
      runAt: sql`now() + make_interval(secs => ${input.delaySeconds ?? 0})`,
    })
    .returning({ id: jobs.id });
  return row.id;
}

/**
 * Enqueue a recompute unless one is already waiting for the same period.
 *
 * Accepting twelve bills in a row should not queue twelve identical recomputes — the
 * engine rebuilds the whole period every time, so one pending job is enough.
 */
export async function enqueueRecompute(organizationId: string, periodId: string): Promise<void> {
  const db = getDb();
  const pending = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        eq(jobs.organizationId, organizationId),
        eq(jobs.kind, "compute_footprint"),
        eq(jobs.status, "pending"),
        sql`${jobs.payload} ->> 'periodId' = ${periodId}`,
      ),
    );
  if (pending.length > 0) return;
  await enqueue({ organizationId, kind: "compute_footprint", payload: { periodId } });
}

/** Claim one due job, or null. The database decides who gets it. */
export async function claimJob(organizationId?: string): Promise<Job | null> {
  const db = getDb();
  const scope = organizationId
    ? sql`and organization_id = ${organizationId}`
    : sql``;
  const rows = await db.execute<Job>(sql`
    update jobs set
      status = 'running',
      started_at = now(),
      attempts = attempts + 1
    where id = (
      select id from jobs
      where status = 'pending' and run_at <= now() ${scope}
      order by run_at asc, created_at asc
      for update skip locked
      limit 1
    )
    returning *
  `);
  const list = rows as unknown as Job[];
  return list.length > 0 ? list[0] : null;
}

async function finish(id: string, error?: string): Promise<void> {
  const db = getDb();
  if (!error) {
    await db
      .update(jobs)
      .set({ status: "done", finishedAt: new Date(), error: null })
      .where(eq(jobs.id, id));
    return;
  }
  // Retry with backoff until maxAttempts, then park as failed for the dead-letter list.
  await db.execute(sql`
    update jobs set
      status = case when attempts >= max_attempts then 'failed'::job_status else 'pending'::job_status end,
      run_at = now() + make_interval(secs => least(300, power(4, attempts)::int)),
      finished_at = case when attempts >= max_attempts then now() else null end,
      error = ${error}
    where id = ${id}
  `);
}

export type JobHandler = (job: Job) => Promise<void>;

export interface RunOptions {
  organizationId?: string;
  /** Stop claiming new work once this much wall-clock time has been spent. */
  budgetMs?: number;
  maxJobs?: number;
}

export interface RunSummary {
  processed: number;
  failed: number;
  errors: string[];
}

/**
 * Drain the queue within a bounded time budget.
 *
 * The budget is what makes this safe on a serverless platform: the cron route calls it
 * with a few seconds less than the function timeout, and whatever is left stays
 * `pending` for the next tick rather than being lost to a killed lambda.
 */
export async function runJobs(
  handlers: Record<JobKind, JobHandler>,
  opts: RunOptions = {},
): Promise<RunSummary> {
  const budgetMs = opts.budgetMs ?? 20_000;
  const maxJobs = opts.maxJobs ?? 50;
  const deadline = Date.now() + budgetMs;
  const summary: RunSummary = { processed: 0, failed: 0, errors: [] };

  while (summary.processed + summary.failed < maxJobs && Date.now() < deadline) {
    const job = await claimJob(opts.organizationId);
    if (!job) break;
    try {
      await handlers[job.kind](job);
      await finish(job.id);
      summary.processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finish(job.id, message.slice(0, 1000));
      summary.failed += 1;
      summary.errors.push(`${job.kind}: ${message}`);
    }
  }

  return summary;
}

/** Jobs that exhausted their retries — the dead-letter list on the settings screen. */
export async function deadLetters(organizationId: string, limit = 20): Promise<Job[]> {
  return getDb()
    .select()
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), eq(jobs.status, "failed")))
    .limit(limit);
}

export async function pendingJobCount(organizationId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(eq(jobs.organizationId, organizationId), inArray(jobs.status, ["pending", "running"])),
    );
  return rows.length;
}
