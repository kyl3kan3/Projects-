/**
 * The board dashboard's numbers, in one place so the dues screen and the
 * monthly digest can never disagree.
 *
 * "Collected vs expected" is scoped to the current period of the association's
 * live schedules. Expected is the sum of what was actually invoiced, not what a
 * schedule says it should be — a treasurer comparing this against the bank
 * statement needs the number that reflects reality, including prorations,
 * waivers, and write-offs.
 */

import { and, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assessmentSchedules,
  households,
  invoiceLines,
  invoices,
  payments,
  type AssessmentSchedule,
  type Invoice,
} from "@/db/schema";
import { compareIso, today, type IsoDate } from "@/lib/dates";
import { periodContaining, periodsThrough, type BillingPeriod } from "@/lib/dues";
import { activeHouseholdCount } from "@/lib/roster";
import { agingSummary, checksToChase } from "@/lib/reminders";
import { enrollmentStats } from "@/lib/autopay";
import { openIssueCount } from "@/lib/issues";
import { recentActivity } from "@/lib/audit";
import { unitUsage } from "@/lib/plans";
import type { Plan as PlanId } from "@/db/schema";

export interface PeriodProgress {
  label: string;
  period: BillingPeriod | null;
  expectedCents: number;
  collectedCents: number;
  processingCents: number;
  outstandingCents: number;
  invoiceCount: number;
  paidCount: number;
  percent: number;
}

/**
 * The current billing period across every live schedule, or the most recent one
 * if nothing is live today (a board looking in January at a schedule that ended
 * in December should still see December).
 */
export async function currentPeriod(
  associationId: string,
  asOf: IsoDate = today(),
): Promise<{ schedule: AssessmentSchedule; period: BillingPeriod } | null> {
  const db = getDb();
  const schedules = await db
    .select()
    .from(assessmentSchedules)
    .where(
      and(eq(assessmentSchedules.associationId, associationId), isNull(assessmentSchedules.archivedAt)),
    );

  let best: { schedule: AssessmentSchedule; period: BillingPeriod } | null = null;
  for (const schedule of schedules) {
    const live = periodContaining(schedule, asOf);
    const candidate = live ?? periodsThrough(schedule, asOf).at(-1) ?? null;
    if (!candidate) continue;
    if (!best || compareIso(candidate.start, best.period.start) > 0) {
      best = { schedule, period: candidate };
    }
  }
  return best;
}

export async function periodProgress(
  associationId: string,
  asOf: IsoDate = today(),
): Promise<PeriodProgress> {
  const current = await currentPeriod(associationId, asOf);
  if (!current) {
    return {
      label: "No dues scheduled",
      period: null,
      expectedCents: 0,
      collectedCents: 0,
      processingCents: 0,
      outstandingCents: 0,
      invoiceCount: 0,
      paidCount: 0,
      percent: 0,
    };
  }

  const db = getDb();
  const rows = await db
    .select({ invoice: invoices })
    .from(invoices)
    .where(
      and(
        eq(invoices.associationId, associationId),
        eq(invoices.assessmentScheduleId, current.schedule.id),
        eq(invoices.periodLabel, current.period.label),
      ),
    );

  const invoiceIds = rows.map((r) => r.invoice.id);
  if (invoiceIds.length === 0) {
    return {
      label: current.period.label,
      period: current.period,
      expectedCents: 0,
      collectedCents: 0,
      processingCents: 0,
      outstandingCents: 0,
      invoiceCount: 0,
      paidCount: 0,
      percent: 0,
    };
  }

  const [lineTotals] = await db
    .select({ total: sql<number>`coalesce(sum(${invoiceLines.amountCents}), 0)::int` })
    .from(invoiceLines)
    .where(inArray(invoiceLines.invoiceId, invoiceIds));

  const paymentTotals = await db
    .select({
      status: payments.status,
      applied: sql<number>`coalesce(sum(${payments.appliedCents}), 0)::int`,
    })
    .from(payments)
    .where(inArray(payments.invoiceId, invoiceIds))
    .groupBy(payments.status);

  const expectedCents = lineTotals?.total ?? 0;
  const collectedCents = paymentTotals.find((p) => p.status === "settled")?.applied ?? 0;
  const processingCents = paymentTotals.find((p) => p.status === "pending")?.applied ?? 0;
  const paidCount = rows.filter((r) => r.invoice.status === "paid").length;

  return {
    label: current.period.label,
    period: current.period,
    expectedCents,
    collectedCents,
    processingCents,
    outstandingCents: Math.max(0, expectedCents - collectedCents),
    invoiceCount: rows.length,
    paidCount,
    percent: expectedCents === 0 ? 0 : Math.min(100, Math.round((collectedCents / expectedCents) * 100)),
  };
}

export interface DashboardData {
  progress: PeriodProgress;
  aging: Awaited<ReturnType<typeof agingSummary>>;
  autopay: Awaited<ReturnType<typeof enrollmentStats>>;
  openIssues: number;
  checksToChase: number;
  activity: Awaited<ReturnType<typeof recentActivity>>;
  usage: ReturnType<typeof unitUsage>;
  hasSchedule: boolean;
  hasRoster: boolean;
}

export async function dashboardData(
  associationId: string,
  planId: PlanId,
  asOf: IsoDate = today(),
): Promise<DashboardData> {
  const db = getDb();
  const [progress, aging, autopay, openIssues, chase, activity, activeUnits] = await Promise.all([
    periodProgress(associationId, asOf),
    agingSummary(associationId, asOf),
    enrollmentStats(associationId),
    openIssueCount(associationId),
    checksToChase(associationId),
    recentActivity(associationId, 8),
    activeHouseholdCount(associationId),
  ]);

  const [scheduleCount] = await db
    .select({ n: count() })
    .from(assessmentSchedules)
    .where(
      and(eq(assessmentSchedules.associationId, associationId), isNull(assessmentSchedules.archivedAt)),
    );

  return {
    progress,
    aging,
    autopay,
    openIssues,
    checksToChase: chase,
    activity,
    usage: unitUsage(planId, activeUnits),
    hasSchedule: Number(scheduleCount?.n ?? 0) > 0,
    hasRoster: activeUnits > 0,
  };
}

/** Invoices settled most recently — the PAID-seal feed on the dues screen. */
export async function recentlySettled(
  associationId: string,
  limit = 5,
): Promise<{ invoice: Invoice; unitLabel: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ invoice: invoices, unitLabel: households.unitLabel })
    .from(invoices)
    .innerJoin(households, eq(invoices.householdId, households.id))
    .where(and(eq(invoices.associationId, associationId), eq(invoices.status, "paid")))
    .orderBy(desc(invoices.paidAt))
    .limit(limit);
  return rows;
}

/** Money received in a date window — reconciliation against the bank. */
export async function collectedBetween(
  associationId: string,
  from: IsoDate,
  to: IsoDate,
): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${payments.appliedCents}), 0)::int` })
    .from(payments)
    .where(
      and(
        eq(payments.associationId, associationId),
        eq(payments.status, "settled"),
        gte(payments.receivedOn, from),
        lte(payments.receivedOn, to),
      ),
    );
  return row?.total ?? 0;
}
