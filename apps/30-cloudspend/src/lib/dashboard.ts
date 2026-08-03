/**
 * The Watch screen's figures, assembled in one place.
 *
 * Everything here is derived as of the request: month-to-date, the forecast, the
 * comparison against the same window of last month, the baseline ghost for the
 * chart, and the deploy pennants. Nothing is read from a status column a cron
 * wrote earlier — that is the "Due on an invoice 212 days late" failure, and on a
 * cost dashboard it would be a wrong number rather than a wrong word.
 */

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { baselines, deploys, type AwsAccount, type Deploy } from "@/db/schema";
import {
  addDays,
  dayKey,
  lastNDayKeys,
  monthName,
  monthStart,
  nextMonthStart,
  previousMonthStart,
  stampShort,
} from "@/lib/dates";
import { dailyTotals, serviceTotals, totalMicros } from "@/lib/facts";
import { forecastMonth, topMovers, type Mover } from "@/lib/forecast";
import { shortServiceName } from "@/lib/digest";

export const CHART_DAYS = 14;

export interface DashboardData {
  mtdMicros: number;
  forecastMicros: number;
  forecastMethod: "trailing" | "run-rate";
  lastMonthTotalMicros: number;
  lastMonthToDateMicros: number;
  lastMonthName: string;
  /** 14 days, oldest first. */
  series: Array<{ day: string; label: string; micros: number; baselineMicros: number }>;
  pennants: Array<{
    index: number;
    sha: string;
    service: string;
    stamp: string;
    href: string | null;
    deployId: string;
  }>;
  nowFraction: number;
  movers: Mover[];
  breakdown: Array<{ service: string; region: string; micros: number; share: number }>;
}

/**
 * Baseline dollars per day, derived from the stored (dow × hour) profile: the sum
 * of every series' median for the 24 hours of that weekday. This is the dashed
 * ghost the chart draws the series against.
 */
async function baselineByDow(accountIds: string[]): Promise<Map<number, number>> {
  const db = getDb();
  const out = new Map<number, number>();
  if (accountIds.length === 0) return out;
  const rows = await db
    .select({ dow: baselines.dow, meanMicros: baselines.meanMicros })
    .from(baselines)
    .where(inArray(baselines.accountId, accountIds));
  for (const row of rows) {
    out.set(row.dow, (out.get(row.dow) ?? 0) + row.meanMicros);
  }
  return out;
}

export async function loadDashboard(
  accountIds: string[],
  orgId: string,
  asOf: Date,
): Promise<DashboardData> {
  const start = monthStart(asOf);
  const mtdMicros = await totalMicros(accountIds, { from: start, to: asOf });

  const lastMonth = previousMonthStart(asOf);
  const lastMonthTotalMicros = await totalMicros(accountIds, {
    from: lastMonth,
    to: nextMonthStart(lastMonth),
  });
  const lastMonthToDateMicros = await totalMicros(accountIds, {
    from: lastMonth,
    to: new Date(lastMonth.getTime() + (asOf.getTime() - start.getTime())),
  });

  const today = new Date(`${dayKey(asOf)}T00:00:00Z`);
  const chartFrom = addDays(today, -(CHART_DAYS - 1));
  const daily = await dailyTotals(accountIds, { from: chartFrom, to: addDays(today, 1) });
  const dailyByDay = new Map(daily.map((d) => [d.day, d.micros]));
  const dowBaseline = await baselineByDow(accountIds);

  const keys = lastNDayKeys(asOf, CHART_DAYS);
  const series = keys.map((day) => {
    const date = new Date(`${day}T00:00:00Z`);
    return {
      day,
      label: day.slice(8),
      micros: dailyByDay.get(day) ?? 0,
      baselineMicros: dowBaseline.get(date.getUTCDay()) ?? 0,
    };
  });

  // The forecast uses complete days only: today is still accruing.
  const completeDays = series.slice(0, series.length - 1).map((s) => s.micros).filter((v) => v > 0);
  const forecast = forecastMonth({ mtdMicros, asOf, recentDailyMicros: completeDays });

  const db = getDb();
  const deployRows = await db
    .select()
    .from(deploys)
    .where(and(eq(deploys.orgId, orgId), gte(deploys.deployedAt, chartFrom), lt(deploys.deployedAt, addDays(today, 1))))
    .orderBy(desc(deploys.deployedAt))
    .limit(12);

  const pennants = deployRows
    .map((deploy: Deploy) => {
      const index = keys.indexOf(dayKey(deploy.deployedAt));
      return {
        index,
        sha: deploy.sha.slice(0, 7),
        service: deploy.serviceName,
        stamp: stampShort(deploy.deployedAt),
        href: deploy.commitUrl,
        deployId: deploy.id,
      };
    })
    .filter((p) => p.index >= 0);

  const windowDays = 7;
  const currentWindow = { from: addDays(today, -windowDays), to: today };
  const previousWindow = { from: addDays(today, -windowDays * 2), to: addDays(today, -windowDays) };
  const current = await serviceTotals(accountIds, currentWindow);
  const previous = await serviceTotals(accountIds, previousWindow);
  const previousByService = new Map<string, number>();
  for (const row of previous) {
    previousByService.set(row.service, (previousByService.get(row.service) ?? 0) + row.micros);
  }
  const currentByService = new Map<string, number>();
  for (const row of current) {
    currentByService.set(row.service, (currentByService.get(row.service) ?? 0) + row.micros);
  }
  const movers = topMovers(
    [...currentByService.entries()].map(([service, micros]) => ({
      key: shortServiceName(service),
      currentMicros: micros,
      previousMicros: previousByService.get(service) ?? 0,
    })),
  );

  const monthBreakdown = await serviceTotals(accountIds, { from: start, to: asOf });
  const breakdownTotal = monthBreakdown.reduce((sum, r) => sum + r.micros, 0) || 1;
  const breakdown = monthBreakdown.slice(0, 6).map((row) => ({
    service: shortServiceName(row.service),
    region: row.region,
    micros: row.micros,
    share: row.micros / breakdownTotal,
  }));

  return {
    mtdMicros,
    forecastMicros: forecast.projectedMicros,
    forecastMethod: forecast.method,
    lastMonthTotalMicros,
    lastMonthToDateMicros,
    lastMonthName: monthName(lastMonth),
    series,
    pennants,
    // The now-line marks where complete days end and today-so-far begins, which
    // is the honest reading of a chart whose last bar is still filling.
    nowFraction: (CHART_DAYS - 2) / (CHART_DAYS - 1),
    movers,
    breakdown,
  };
}

/** Which account labels feed the switcher, in a shape a client component can take. */
export function switcherAccounts(accounts: AwsAccount[]) {
  return accounts.map((a) => ({ id: a.id, label: a.label, demo: a.provider === "demo" }));
}
