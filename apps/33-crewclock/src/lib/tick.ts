/**
 * The background sweep. One idempotent function, reached from
 * `/api/cron/tick` (Vercel Cron) or `npm run worker` (a long-lived host).
 * See src/lib/runtime.ts for why it is shaped this way.
 *
 * It does three things, all of them safe to run twice in the same minute:
 *
 *  1. Flag shifts left open past the org's maximum. Never closes them.
 *  2. Project each worker's payroll week and send the pre-overtime alert,
 *     guarded by a unique index on `(user_id, week_start)`.
 *  3. Roll up job labour cost against the bid and fire the 80% / 100% budget
 *     alerts, each once for the life of the job.
 */

import { and, eq, gte, isNotNull, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  jobs,
  organizations,
  overtimeAlerts,
  timeEntries,
  users,
  type Job,
  type Organization,
  type User,
} from "@/db/schema";
import { notifyOwner } from "@/lib/alerts";
import { t } from "@/lib/i18n";
import { jobCost } from "@/lib/jobs";
import { budgetThresholdToFire } from "@/lib/job-costing";
import {
  projectWeekHours,
  remainingDaysOfWeek,
  shouldAlertOvertime,
  weeklyThresholdHours,
} from "@/lib/overtime";
import { planAllows } from "@/lib/plans";
import { tickBudgetMs } from "@/lib/runtime";
import {
  addDaysToDateKey,
  dayOfWeekForKey,
  formatMoneyCents,
  localDateKey,
  localRangeUtc,
  secondsToHours,
  startOfLocalDay,
  weekStartKey,
} from "@/lib/time";
import { entrySeconds, flagStaleOpenEntries } from "@/lib/time-entries";

export interface TickSummary {
  organizations: number;
  staleFlagged: number;
  overtimeAlerts: number;
  budgetAlerts: number;
  deferred: number;
  tookMs: number;
}

export async function runTick(now: Date = new Date()): Promise<TickSummary> {
  const startedAt = Date.now();
  const deadline = startedAt + tickBudgetMs();
  const db = getDb();
  const orgs = await db.select().from(organizations);

  const summary: TickSummary = {
    organizations: 0,
    staleFlagged: 0,
    overtimeAlerts: 0,
    budgetAlerts: 0,
    deferred: 0,
    tookMs: 0,
  };

  for (const org of orgs) {
    if (Date.now() > deadline) {
      summary.deferred += 1;
      continue;
    }
    summary.organizations += 1;
    try {
      summary.staleFlagged += await flagStaleOpenEntries(org, now);
      summary.overtimeAlerts += await scanOvertime(org, now);
      if (planAllows(org.plan, "budgetAlerts")) {
        summary.budgetAlerts += await scanBudgets(org, now);
      }
    } catch (err) {
      console.error(`[tick] org ${org.id} failed`, err);
    }
  }

  summary.tookMs = Date.now() - startedAt;
  return summary;
}

/* -------------------------------------------------------------- overtime --- */

const TRAILING_WEEKS = 4;

export async function scanOvertime(org: Organization, now: Date): Promise<number> {
  const db = getDb();
  const todayKey = localDateKey(now, org.timezone);
  const weekStart = weekStartKey(now, org.timezone, org.weekStartsOn);
  const weekEnd = addDaysToDateKey(weekStart, 6);

  const crew = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.organizationId, org.id),
        eq(users.active, true),
        ne(users.overtimeRule, "none"),
      ),
    );

  let sent = 0;
  for (const worker of crew) {
    const decision = await projectFor(org, worker, weekStart, weekEnd, todayKey, now);
    if (!decision.shouldAlert) continue;

    // The unique index is the guarantee; onConflictDoNothing turns a second
    // scan in the same week into a no-op instead of a second text message.
    const [row] = await db
      .insert(overtimeAlerts)
      .values({
        organizationId: org.id,
        userId: worker.id,
        weekStart,
        hoursToDate: decision.hoursToDate,
        projectedHours: decision.projectedHours,
        thresholdHours: decision.thresholdHours,
        channel: org.smsAlertsEnabled && org.alertPhone ? "sms" : "email",
      })
      .onConflictDoNothing({ target: [overtimeAlerts.userId, overtimeAlerts.weekStart] })
      .returning();
    if (!row) continue;

    const locale = org.defaultLocale;
    await notifyOwner(org, {
      subject: t(locale, "alert.ot.subject", {
        name: worker.name,
        projected: decision.projectedHours.toFixed(1),
      }),
      body: t(locale, "alert.ot.body", {
        name: worker.name,
        toDate: decision.hoursToDate.toFixed(1),
        day: todayKey,
        projected: decision.projectedHours.toFixed(1),
        threshold: decision.thresholdHours.toFixed(0),
      }),
    });
    await db.update(overtimeAlerts).set({ sentAt: new Date() }).where(eq(overtimeAlerts.id, row.id));
    sent += 1;
  }
  return sent;
}

export interface OvertimeDecision {
  shouldAlert: boolean;
  hoursToDate: number;
  projectedHours: number;
  thresholdHours: number;
  reason: string;
}

/** Exported so the review screen can show the same projection the alert used. */
export async function projectFor(
  org: Organization,
  worker: User,
  weekStart: string,
  weekEnd: string,
  todayKey: string,
  now: Date,
): Promise<OvertimeDecision> {
  const db = getDb();
  const thresholdHours = weeklyThresholdHours(worker.overtimeRule, org.otWeeklyThresholdHours);

  const thisWeek = localRangeUtc(weekStart, weekEnd, org.timezone);
  const weekEntries = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, worker.id),
        gte(timeEntries.clockInAt, thisWeek.start),
        lt(timeEntries.clockInAt, thisWeek.end),
      ),
    );

  const secondsByDay = new Map<string, number>();
  for (const entry of weekEntries) {
    const key = localDateKey(entry.clockInAt, org.timezone);
    secondsByDay.set(key, (secondsByDay.get(key) ?? 0) + entrySeconds(entry, now));
  }
  const secondsToDate = [...secondsByDay.values()].reduce((a, b) => a + b, 0);
  const hoursToDate = Math.round(secondsToHours(secondsToDate) * 100) / 100;

  // Trailing weeks, for the per-weekday average.
  const historyStart = addDaysToDateKey(weekStart, -7 * TRAILING_WEEKS);
  const history = localRangeUtc(historyStart, addDaysToDateKey(weekStart, -1), org.timezone);
  const past = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, worker.id),
        gte(timeEntries.clockInAt, history.start),
        lt(timeEntries.clockInAt, history.end),
        isNotNull(timeEntries.clockOutAt),
      ),
    );

  const pastByDay = new Map<string, number>();
  for (const entry of past) {
    const key = localDateKey(entry.clockInAt, org.timezone);
    pastByDay.set(key, (pastByDay.get(key) ?? 0) + entrySeconds(entry, now));
  }
  const perDow = new Map<number, number[]>();
  const observedWeekKeys = new Set<string>();
  for (const [key, seconds] of pastByDay) {
    perDow.set(dayOfWeekForKey(key), [
      ...(perDow.get(dayOfWeekForKey(key)) ?? []),
      secondsToHours(seconds),
    ]);
    observedWeekKeys.add(weekStartKey(startOfLocalDay(key, org.timezone), org.timezone, org.weekStartsOn));
  }

  /*
   * Divide by the number of weeks we actually observed, not by the window: a
   * worker with one week of history who worked 9h last Thursday projects 9h
   * this Thursday, while a worker with four weeks who showed up on one of four
   * Saturdays projects a quarter of a Saturday. Dividing by a fixed 4 would
   * quietly understate every new hire's week and never warn about them.
   */
  const observedWeeks = Math.min(TRAILING_WEEKS, Math.max(1, observedWeekKeys.size));
  const weekdayAverageHours: Partial<Record<number, number>> = {};
  if (observedWeekKeys.size > 0) {
    // With any history at all, a weekday the worker never works contributes 0 —
    // an explicit zero, not a gap that falls back to their average day.
    for (let dow = 0; dow < 7; dow++) {
      const samples = perDow.get(dow) ?? [];
      weekdayAverageHours[dow] = samples.reduce((a, b) => a + b, 0) / observedWeeks;
    }
  }

  const { daysOfWeek } = remainingDaysOfWeek(weekStart, todayKey);
  const daysWorkedThisWeek = secondsByDay.size;
  // Used only for a worker with no history at all: all we know is this week.
  const fallbackDailyHours = daysWorkedThisWeek > 0 ? hoursToDate / daysWorkedThisWeek : 0;

  const projectedHours = projectWeekHours({
    hoursToDate,
    remainingDaysOfWeek: daysOfWeek,
    weekdayAverageHours,
    fallbackDailyHours,
  });

  const decision = shouldAlertOvertime({
    hoursToDate,
    projectedHours,
    thresholdHours,
    remainingDays: daysOfWeek.length,
  });

  return {
    shouldAlert: decision.shouldAlert,
    hoursToDate,
    projectedHours,
    thresholdHours,
    reason: decision.reason,
  };
}

/* --------------------------------------------------------------- budgets --- */

export async function scanBudgets(org: Organization, now: Date): Promise<number> {
  const db = getDb();
  const active = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.organizationId, org.id), eq(jobs.status, "active")));

  let fired = 0;
  for (const job of active) {
    if (job.bidLaborCostCents === null && job.bidLaborMinutes === null) continue;
    fired += (await checkJobBudget(org, job, now)) ? 1 : 0;
  }
  return fired;
}

/** Also called right after a punch closes, so the alert is same-day. */
export async function checkJobBudget(
  org: Organization,
  job: Job,
  now: Date = new Date(),
): Promise<boolean> {
  if (!planAllows(org.plan, "budgetAlerts")) return false;
  const { rollup } = await jobCost(job, org, now);
  const threshold = budgetThresholdToFire(rollup.percentOfBid, {
    at80: job.budgetAlert80SentAt,
    at100: job.budgetAlert100SentAt,
  });
  if (!threshold) return false;

  const db = getDb();
  const locale = org.defaultLocale;
  const percent = (rollup.percentOfBid ?? 0).toFixed(0);
  const spent = formatMoneyCents(rollup.actualCostCents);
  const bid = rollup.bidCostCents === null ? "—" : formatMoneyCents(rollup.bidCostCents);
  const hours = rollup.actualHours.toFixed(1);

  const stamp = new Date();
  // Stamp first: an alert we might send twice is worse than one we might not
  // send, and the send is retried by the next tick only if the stamp failed.
  await db
    .update(jobs)
    .set(threshold === 100 ? { budgetAlert100SentAt: stamp } : { budgetAlert80SentAt: stamp })
    .where(eq(jobs.id, job.id));

  await notifyOwner(org, {
    subject: t(locale, threshold === 100 ? "alert.budget100.subject" : "alert.budget80.subject", {
      job: job.name,
      percent,
    }),
    body: t(locale, threshold === 100 ? "alert.budget100.body" : "alert.budget80.body", {
      job: job.name,
      client: job.clientName || "—",
      spent,
      bid,
      percent,
      hours,
    }),
  });
  return true;
}
