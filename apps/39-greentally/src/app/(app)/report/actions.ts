"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reportingPeriods, reports } from "@/db/schema";
import { requireOnboarded } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { isRedirectError, safeMessage, ValidationError } from "@/lib/errors";
import { canDownloadReport } from "@/lib/plans";
import { buildReportContext } from "@/lib/report";
import { formatTonnes } from "@/lib/units";
import type { ReportTotals } from "@/db/schema";

export interface ReportState {
  error?: string;
  reportId?: string;
}

/**
 * Generate (or refresh) the CSRD-lite report for the current period.
 *
 * The row stores a snapshot of the totals so a report that was sent to a customer can
 * always be compared against what the engine says today — the "did the number change"
 * question, answerable.
 */
export async function generateReport(_prev: ReportState, _form: FormData): Promise<ReportState> {
  try {
    const { user, org, period } = await requireOnboarded();
    const gate = canDownloadReport(org.plan);
    if (!gate.allowed) throw new ValidationError(gate.reason);

    const ctx = await buildReportContext(period.id);
    if (ctx.totals.totalMarket === 0) {
      throw new ValidationError(
        "There is nothing to report yet — accept at least one bill first.",
      );
    }

    const totals: ReportTotals = {
      engineVersion: ctx.engineVersion,
      year: ctx.period.year,
      scope1Gco2e: ctx.totals.scope1,
      scope2LocationGco2e: ctx.totals.scope2Location,
      scope2MarketGco2e: ctx.totals.scope2Market,
      scope3SpendGco2e: ctx.totals.scope3Spend,
      totalMarketGco2e: ctx.totals.totalMarket,
      totalLocationGco2e: ctx.totals.totalLocation,
      intensityPerRevenueMilli: ctx.intensityPerRevenueMilli,
      intensityPerFteMilli: ctx.intensityPerFteMilli,
      monthsComplete: ctx.coverage.monthsComplete,
      coveragePct: ctx.coverage.pct,
      factorCitations: ctx.factorsUsed,
    };

    const db = getDb();
    const [row] = await db
      .insert(reports)
      .values({
        organizationId: org.id,
        periodId: period.id,
        kind: "csrd_lite",
        totalsSnapshot: totals,
        renderedAt: new Date(),
      })
      .returning();

    await audit({
      organizationId: org.id,
      actor: user.id,
      actorLabel: user.name,
      action: "report.generated",
      target: `Reporting year ${period.year}`,
      metadata: {
        total: `${formatTonnes(ctx.totals.totalMarket)} tCO2e`,
        reportId: row.id,
        coveragePct: ctx.coverage.pct,
      },
    });

    revalidatePath("/report");
    return { reportId: row.id };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    return { error: safeMessage(err, "Could not generate the report.") };
  }
}

export async function lockPeriod(): Promise<void> {
  const { user, org, period } = await requireOnboarded();
  const db = getDb();
  if (period.lockedAt) return;
  await db
    .update(reportingPeriods)
    .set({ lockedAt: new Date(), status: "complete" })
    .where(eq(reportingPeriods.id, period.id));
  await audit({
    organizationId: org.id,
    actor: user.id,
    actorLabel: user.name,
    action: "period.locked",
    target: `Reporting year ${period.year}`,
    metadata: { year: String(period.year) },
  });
  revalidatePath("/report");
  revalidatePath("/documents");
  revalidatePath("/footprint");
}

export async function unlockPeriod(): Promise<void> {
  const { user, org, period } = await requireOnboarded();
  const db = getDb();
  if (!period.lockedAt) return;
  await db
    .update(reportingPeriods)
    .set({ lockedAt: null, status: "review" })
    .where(eq(reportingPeriods.id, period.id));
  await audit({
    organizationId: org.id,
    actor: user.id,
    actorLabel: user.name,
    action: "period.unlocked",
    target: `Reporting year ${period.year}`,
    metadata: { year: String(period.year) },
  });
  revalidatePath("/report");
  revalidatePath("/documents");
  revalidatePath("/footprint");
}

/** The most recent generated report for a period, if any. */
export async function latestReportId(periodId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: reports.id })
    .from(reports)
    .where(eq(reports.periodId, periodId))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row?.id ?? null;
}
