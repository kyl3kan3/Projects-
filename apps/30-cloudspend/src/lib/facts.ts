/**
 * Reads over `cost_facts`.
 *
 * One rule runs through every query here: **timestamps are compared with
 * Drizzle's typed operators (`gte`, `lt`), never interpolated into a raw `sql`
 * fragment.** A `Date` inside `sql\`${col} > ${date}\`` bypasses the column
 * encoder, and postgres.js then calls `Buffer.byteLength` on a Date object and
 * throws at runtime — a failure that type-checks perfectly and only appears when
 * a customer loads the screen.
 *
 * Where a raw fragment is unavoidable (`date_trunc`, `sum`), only *columns* are
 * interpolated, and they are passed as Drizzle `Column` objects so they render
 * table-qualified rather than binding to an enclosing alias.
 */

import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { costFacts } from "@/db/schema";
import { sumToMicros } from "@/lib/money";

export interface Window {
  from: Date;
  /** Exclusive. */
  to: Date;
}

function accountFilter(accountIds: string[]) {
  return accountIds.length === 1
    ? eq(costFacts.accountId, accountIds[0])
    : inArray(costFacts.accountId, accountIds);
}

function scope(accountIds: string[], window: Window) {
  return and(accountFilter(accountIds), gte(costFacts.ts, window.from), lt(costFacts.ts, window.to));
}

/** Total spend in a window. */
export async function totalMicros(accountIds: string[], window: Window): Promise<number> {
  if (accountIds.length === 0) return 0;
  const db = getDb();
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)` })
    .from(costFacts)
    .where(scope(accountIds, window));
  return sumToMicros(row?.total);
}

export interface DayTotal {
  day: string;
  micros: number;
}

/** Daily totals, for the 14-day dashboard chart. */
export async function dailyTotals(accountIds: string[], window: Window): Promise<DayTotal[]> {
  if (accountIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${costFacts.ts}), 'YYYY-MM-DD')`,
      total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)`,
    })
    .from(costFacts)
    .where(scope(accountIds, window))
    .groupBy(sql`date_trunc('day', ${costFacts.ts})`)
    .orderBy(sql`date_trunc('day', ${costFacts.ts})`);
  return rows.map((r) => ({ day: r.day, micros: sumToMicros(r.total) }));
}

export interface HourTotal {
  ts: Date;
  micros: number;
}

/** Hourly totals for one account — the detector's and the zoom chart's input. */
export async function hourlyTotals(accountId: string, window: Window): Promise<HourTotal[]> {
  const db = getDb();
  const rows = await db
    .select({
      ts: costFacts.ts,
      total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)`,
    })
    .from(costFacts)
    .where(scope([accountId], window))
    .groupBy(costFacts.ts)
    .orderBy(costFacts.ts);
  return rows.map((r) => ({ ts: r.ts, micros: sumToMicros(r.total) }));
}

export interface SeriesRow {
  service: string;
  region: string;
  ts: Date;
  micros: number;
}

/**
 * Hourly series per (service, region) for one account — one query, because the
 * detector evaluates every series and N queries per account per tick is how a
 * cron route runs out of time budget.
 */
export async function hourlySeriesByService(
  accountId: string,
  window: Window,
): Promise<SeriesRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      service: costFacts.service,
      region: costFacts.region,
      ts: costFacts.ts,
      total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)`,
    })
    .from(costFacts)
    .where(scope([accountId], window))
    .groupBy(costFacts.service, costFacts.region, costFacts.ts)
    .orderBy(costFacts.service, costFacts.region, costFacts.ts);
  return rows.map((r) => ({
    service: r.service,
    region: r.region,
    ts: r.ts,
    micros: sumToMicros(r.total),
  }));
}

export interface ServiceTotal {
  service: string;
  region: string;
  micros: number;
}

/** Per-service/region totals, for the breakdown and the movers comparison. */
export async function serviceTotals(
  accountIds: string[],
  window: Window,
): Promise<ServiceTotal[]> {
  if (accountIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      service: costFacts.service,
      region: costFacts.region,
      total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)`,
    })
    .from(costFacts)
    .where(scope(accountIds, window))
    .groupBy(costFacts.service, costFacts.region)
    .orderBy(sql`sum(${costFacts.amountMicros}) desc`);
  return rows.map((r) => ({
    service: r.service,
    region: r.region,
    micros: sumToMicros(r.total),
  }));
}

/** Per-service totals, ignoring region — what "top movers" compares. */
export async function serviceOnlyTotals(
  accountIds: string[],
  window: Window,
): Promise<Array<{ service: string; micros: number }>> {
  if (accountIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      service: costFacts.service,
      total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)`,
    })
    .from(costFacts)
    .where(scope(accountIds, window))
    .groupBy(costFacts.service);
  return rows.map((r) => ({ service: r.service, micros: sumToMicros(r.total) }));
}

export interface ContributorRow {
  label: string;
  detail: string;
  micros: number;
}

/**
 * Contributor strata for an anomaly: resource-level when CUR is present, usage
 * type otherwise. This is read from our own facts rather than re-queried from
 * Cost Explorer, because each of those queries costs a cent.
 */
export async function contributorTotals(
  accountId: string,
  opts: { service: string; region: string } & Window,
  limit = 5,
): Promise<ContributorRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      usageType: costFacts.usageType,
      resourceId: costFacts.resourceId,
      total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)`,
    })
    .from(costFacts)
    .where(
      and(
        eq(costFacts.accountId, accountId),
        eq(costFacts.service, opts.service),
        eq(costFacts.region, opts.region),
        gte(costFacts.ts, opts.from),
        lt(costFacts.ts, opts.to),
      ),
    )
    .groupBy(costFacts.usageType, costFacts.resourceId)
    .orderBy(sql`sum(${costFacts.amountMicros}) desc`)
    .limit(limit);
  return rows.map((r) => ({
    label: r.resourceId || r.usageType,
    detail: r.resourceId ? r.usageType : `${opts.region} · usage type`,
    micros: sumToMicros(r.total),
  }));
}

/** Tag values seen for a key, so the budget form can offer real options. */
export async function tagValuesFor(orgId: string, key: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ tagHash: costFacts.tagHash })
    .from(costFacts)
    .where(eq(costFacts.orgId, orgId))
    .limit(500);
  const values = new Set<string>();
  for (const row of rows) {
    for (const pair of row.tagHash.split("|")) {
      const [k, v] = pair.split("=");
      if (k === key && v) values.add(v);
    }
  }
  return [...values].sort();
}

/** Distinct services seen for an org, for the budget scope picker. */
export async function knownServices(orgId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ service: costFacts.service })
    .from(costFacts)
    .where(eq(costFacts.orgId, orgId))
    .orderBy(costFacts.service);
  return rows.map((r) => r.service);
}

/** Distinct tag keys seen for an org. */
export async function knownTagPairs(orgId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ tagHash: costFacts.tagHash })
    .from(costFacts)
    .where(eq(costFacts.orgId, orgId))
    .limit(500);
  const pairs = new Set<string>();
  for (const row of rows) {
    if (row.tagHash === "-") continue;
    for (const pair of row.tagHash.split("|")) if (pair.includes("=")) pairs.add(pair);
  }
  return [...pairs].sort();
}

/**
 * Spend inside a budget's scope. Tag scopes match a `k=v` pair inside the
 * canonical tag hash, which is why the hash is stored sorted and
 * pipe-delimited — `like '%Team=api%'` would also match `Team=api-legacy`, so the
 * comparison is on a delimited pattern.
 */
export async function budgetSpendMicros(
  budget: { orgId: string; scope: string; scopeValue: string },
  window: Window,
  accountIds: string[],
): Promise<number> {
  if (accountIds.length === 0) return 0;
  const db = getDb();
  const base = [gte(costFacts.ts, window.from), lt(costFacts.ts, window.to)];

  if (budget.scope === "service") {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)` })
      .from(costFacts)
      .where(and(accountFilter(accountIds), eq(costFacts.service, budget.scopeValue), ...base));
    return sumToMicros(row?.total);
  }

  if (budget.scope === "account") {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)` })
      .from(costFacts)
      .where(and(eq(costFacts.accountId, budget.scopeValue), ...base));
    return sumToMicros(row?.total);
  }

  // Tag scope: exact pair match within the delimited hash.
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${costFacts.amountMicros}), 0)` })
    .from(costFacts)
    .where(
      and(
        accountFilter(accountIds),
        sql`'|' || ${costFacts.tagHash} || '|' like ${`%|${budget.scopeValue}|%`}`,
        ...base,
      ),
    );
  return sumToMicros(row?.total);
}

/**
 * What has actually been ingested for one account.
 *
 * The connect screen renders this rather than the transient "backfilled 3,304
 * rows" message the verify action returns: revalidating the page unmounts the
 * form that held that message, so a confirmation the customer can still read a
 * minute later has to come from the database.
 */
export async function factsSummary(
  accountId: string,
): Promise<{ rows: number; from: Date | null; to: Date | null }> {
  const db = getDb();
  const [row] = await db
    .select({
      rows: sql<string>`count(*)`,
      from: sql<Date | null>`min(${costFacts.ts})`,
      to: sql<Date | null>`max(${costFacts.ts})`,
    })
    .from(costFacts)
    .where(eq(costFacts.accountId, accountId));
  return {
    rows: Number(row?.rows ?? 0),
    from: row?.from ? new Date(row.from) : null,
    to: row?.to ? new Date(row.to) : null,
  };
}

/** Does this account have any facts at all? Drives the empty state. */
export async function hasAnyFacts(accountIds: string[]): Promise<boolean> {
  if (accountIds.length === 0) return false;
  const db = getDb();
  const [row] = await db
    .select({ id: costFacts.id })
    .from(costFacts)
    .where(accountFilter(accountIds))
    .limit(1);
  return Boolean(row);
}
