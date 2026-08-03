/**
 * The tick — one pass of everything CloudSpend does on a schedule.
 *
 * Deployment target is Vercel + Neon, which has no always-on processes, so this
 * is a plain async function with a **time budget** rather than a queue consumer.
 * `/api/cron/tick` calls it; `npm run worker` calls the same function on a loop.
 * It is idempotent, so running both at once double-sends nothing: every write is
 * an upsert and every alert is claimed in `alert_log` before it is sent.
 *
 * Order matters. Ingest, then baselines, then detect (a detector reading a stale
 * baseline is the source of both false positives and silence), then budgets, then
 * waste, then the digest last so it can report on everything the tick just found.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  anomalies,
  awsAccounts,
  baselines,
  budgetAlerts,
  budgets,
  deploys,
  orgs,
  wasteFindings,
  type Anomaly,
  type AwsAccount,
  type Org,
} from "@/db/schema";
import {
  addDays,
  addHours,
  dayKey,
  floorHour,
  monthKey,
  monthStart,
  previousMonthStart,
  nextMonthStart,
  stampUtc,
} from "@/lib/dates";
import { formatPerDay, formatUsd, formatUsdWhole } from "@/lib/money";
import { buildProfile, profileFromCells, profileIsTrustworthy, type BaselineCell } from "@/lib/baseline";
import {
  correlateDeploy,
  detect,
  leadTimeLabel,
  rankContributors,
  shouldResolve,
  type DeployMarker,
} from "@/lib/anomaly";
import { providerFor } from "@/lib/aws/provider";
import { ingestRecent, importCur } from "@/lib/ingestion";
import {
  contributorTotals,
  dailyTotals,
  hourlySeriesByService,
  serviceOnlyTotals,
  totalMicros,
  budgetSpendMicros,
} from "@/lib/facts";
import { forecastMonth, topMovers } from "@/lib/forecast";
import { burnState, nextRung, rungMessage, scopeLabel } from "@/lib/budgets";
import { planMerge, rankFindings, recoverableMicros } from "@/lib/waste";
import { buildDigest, digestToText, shortServiceName } from "@/lib/digest";
import {
  anomalyBlocks,
  anomalyNotificationText,
  budgetBlocks,
  digestBlocks,
  type AnomalyCardInput,
} from "@/lib/slack-blocks";
import { dispatch, slackCoordinates } from "@/lib/notify";
import { plan } from "@/lib/plans";
import { env } from "@/lib/env";

const HOURLY_LOOKBACK_DAYS = 14;
const BASELINE_MAX_AGE_MS = 6 * 3_600_000;
const WASTE_MAX_AGE_MS = 20 * 3_600_000;

export interface TickOptions {
  budgetMs?: number;
  orgId?: string;
  asOf?: Date;
  skipIngest?: boolean;
}

export interface AccountTickResult {
  accountId: string;
  label: string;
  factsIngested: number;
  curFacts: number;
  curErrors: string[];
  seriesEvaluated: number;
  anomaliesOpened: number;
  anomaliesResolved: number;
  wasteFindings: number;
}

export interface OrgTickResult {
  orgId: string;
  orgName: string;
  accounts: AccountTickResult[];
  budgetAlertsSent: number;
  digestSent: boolean;
  notes: string[];
}

export interface TickResult {
  orgs: OrgTickResult[];
  durationMs: number;
  outOfTime: boolean;
}

export async function runTick(options: TickOptions = {}): Promise<TickResult> {
  const startedAt = Date.now();
  const budgetMs = options.budgetMs ?? 50_000;
  const asOf = options.asOf ?? new Date();
  const db = getDb();

  const orgRows = options.orgId
    ? await db.select().from(orgs).where(eq(orgs.id, options.orgId))
    : await db.select().from(orgs);

  const result: TickResult = { orgs: [], durationMs: 0, outOfTime: false };

  for (const org of orgRows) {
    if (Date.now() - startedAt > budgetMs) {
      result.outOfTime = true;
      break;
    }
    result.orgs.push(await tickOrg(org, asOf, options));
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

async function tickOrg(org: Org, asOf: Date, options: TickOptions): Promise<OrgTickResult> {
  const db = getDb();
  const out: OrgTickResult = {
    orgId: org.id,
    orgName: org.name,
    accounts: [],
    budgetAlertsSent: 0,
    digestSent: false,
    notes: [],
  };

  const accounts = await db
    .select()
    .from(awsAccounts)
    .where(and(eq(awsAccounts.orgId, org.id), eq(awsAccounts.connectStatus, "verified")));

  if (accounts.length === 0) {
    out.notes.push("No verified AWS accounts; nothing to do.");
    return out;
  }

  for (const account of accounts) {
    out.accounts.push(await tickAccount(org, account, asOf, options));
  }

  out.budgetAlertsSent = await evaluateBudgets(org, accounts, asOf);
  out.digestSent = await maybeSendDigest(org, accounts, asOf);
  return out;
}

async function tickAccount(
  org: Org,
  account: AwsAccount,
  asOf: Date,
  options: TickOptions,
): Promise<AccountTickResult> {
  const db = getDb();
  const out: AccountTickResult = {
    accountId: account.id,
    label: account.label,
    factsIngested: 0,
    curFacts: 0,
    curErrors: [],
    seriesEvaluated: 0,
    anomaliesOpened: 0,
    anomaliesResolved: 0,
    wasteFindings: 0,
  };

  let current = account;

  if (!options.skipIngest) {
    if (current.curBucket) {
      const cur = await importCur(current, asOf);
      out.curFacts = cur.facts;
      out.curErrors = cur.errors;
      // Re-read: importCur moved cur_covered_through, which the poller respects.
      const [refreshed] = await db.select().from(awsAccounts).where(eq(awsAccounts.id, current.id));
      if (refreshed) current = refreshed;
    }
    const ingest = await ingestRecent(current, asOf);
    out.factsIngested = ingest.facts;
  }

  const evaluation = await evaluateAccount(org, current, asOf);
  out.seriesEvaluated = evaluation.seriesEvaluated;
  out.anomaliesOpened = evaluation.opened;
  out.anomaliesResolved = evaluation.resolved;

  out.wasteFindings = await maybeScanWaste(org, current, asOf);
  return out;
}

/* ------------------------------------------------------ baselines + detect */

interface SeriesKey {
  service: string;
  region: string;
}

function seriesId(key: SeriesKey): string {
  return `${key.service}|${key.region}`;
}

async function refreshBaselines(
  account: AwsAccount,
  series: Map<string, { key: SeriesKey; samples: Array<{ ts: Date; micros: number }> }>,
  asOf: Date,
): Promise<void> {
  const db = getDb();
  const [latest] = await db
    .select({ updatedAt: baselines.updatedAt })
    .from(baselines)
    .where(eq(baselines.accountId, account.id))
    .orderBy(sql`${baselines.updatedAt} desc`)
    .limit(1);
  if (latest && asOf.getTime() - latest.updatedAt.getTime() < BASELINE_MAX_AGE_MS) return;

  const rows: Array<{
    accountId: string;
    service: string;
    region: string;
    dow: number;
    hour: number;
    meanMicros: number;
    stddevMicros: number;
    samples: number;
    updatedAt: Date;
  }> = [];

  for (const { key, samples } of series.values()) {
    for (const cell of buildProfile(samples)) {
      rows.push({
        accountId: account.id,
        service: key.service,
        region: key.region,
        dow: cell.dow,
        hour: cell.hour,
        meanMicros: cell.medianMicros,
        stddevMicros: cell.sigmaMicros,
        samples: cell.samples,
        updatedAt: asOf,
      });
    }
  }
  if (rows.length === 0) return;

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db
      .insert(baselines)
      .values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: [
          baselines.accountId,
          baselines.service,
          baselines.region,
          baselines.dow,
          baselines.hour,
        ],
        set: {
          meanMicros: sql`excluded.mean_micros`,
          stddevMicros: sql`excluded.stddev_micros`,
          samples: sql`excluded.samples`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }
}

/**
 * Zero-fill the hours a series produced no rows for. An idle hour is a real
 * observation of zero; leaving the gap out would make the profile think the
 * service simply has no data at that hour, and the detector never fires on an
 * hour with no baseline cell.
 */
function zeroFill(
  samples: Array<{ ts: Date; micros: number }>,
  from: Date,
  to: Date,
): Array<{ ts: Date; micros: number }> {
  const byHour = new Map(samples.map((s) => [s.ts.getTime(), s.micros]));
  const out: Array<{ ts: Date; micros: number }> = [];
  for (let ts = from; ts < to; ts = addHours(ts, 1)) {
    out.push({ ts: new Date(ts), micros: byHour.get(ts.getTime()) ?? 0 });
  }
  return out;
}

/**
 * Name what is actually costing the money.
 *
 * Our own facts are read first, because they are free. Cost Explorer's grouped
 * queries cannot return a third dimension, so without CUR those facts only carry
 * a usage type — and "BoxUsage:m6i.2xlarge is up" is not something an engineer can
 * act on. In that case (and only in that case) we spend one Cost Explorer request
 * on resource-level contributors, once per anomaly onset.
 */
async function enrichContributors(
  account: AwsAccount,
  key: SeriesKey,
  from: Date,
  to: Date,
  hoursSustained: number,
): Promise<Array<{ label: string; detail: string; deltaPerDayMicros: number }>> {
  const perDay = (micros: number) => Math.round((micros / Math.max(1, hoursSustained)) * 24);

  const own = await contributorTotals(account.id, {
    service: key.service,
    region: key.region,
    from,
    to,
  });
  const hasResourceGrain = own.some((c) => c.label.startsWith("i-") || c.label.includes("arn:"));
  if (hasResourceGrain || own.length === 0) {
    return own.slice(0, 4).map((c) => ({
      label: c.label,
      detail: c.detail,
      deltaPerDayMicros: perDay(c.micros),
    }));
  }

  try {
    const provider = await providerFor(account);
    const resourceLevel = await provider.fetchContributors(account, {
      service: key.service,
      region: key.region,
      start: from,
      end: to,
    });
    if (resourceLevel.length) {
      return rankContributors(resourceLevel, 4).map((c) => ({
        label: c.label,
        detail: c.detail,
        deltaPerDayMicros: perDay(c.amountMicros),
      }));
    }
  } catch {
    // A resource-level lookup is an enrichment, not a precondition: if AWS
    // refuses it the alert still goes out with the usage-type breakdown.
  }
  return own.slice(0, 4).map((c) => ({
    label: c.label,
    detail: c.detail,
    deltaPerDayMicros: perDay(c.micros),
  }));
}

async function evaluateAccount(
  org: Org,
  account: AwsAccount,
  asOf: Date,
): Promise<{ seriesEvaluated: number; opened: number; resolved: number }> {
  const db = getDb();
  const end = floorHour(asOf);
  const from = addDays(end, -HOURLY_LOOKBACK_DAYS);

  const rows = await hourlySeriesByService(account.id, { from, to: end });
  const series = new Map<string, { key: SeriesKey; samples: Array<{ ts: Date; micros: number }> }>();
  for (const row of rows) {
    const key = { service: row.service, region: row.region };
    const id = seriesId(key);
    const entry = series.get(id);
    if (entry) entry.samples.push({ ts: row.ts, micros: row.micros });
    else series.set(id, { key, samples: [{ ts: row.ts, micros: row.micros }] });
  }

  // Zero-fill before anything else reads the samples.
  for (const entry of series.values()) {
    entry.samples = zeroFill(entry.samples, from, end);
  }

  await refreshBaselines(account, series, asOf);

  const cells = await db
    .select()
    .from(baselines)
    .where(eq(baselines.accountId, account.id));
  const profiles = new Map<string, BaselineCell[]>();
  for (const cell of cells) {
    const id = seriesId({ service: cell.service, region: cell.region });
    const list = profiles.get(id);
    const converted: BaselineCell = {
      dow: cell.dow,
      hour: cell.hour,
      medianMicros: cell.meanMicros,
      sigmaMicros: cell.stddevMicros,
      samples: cell.samples,
    };
    if (list) list.push(converted);
    else profiles.set(id, [converted]);
  }

  const live = await db
    .select()
    .from(anomalies)
    .where(and(eq(anomalies.accountId, account.id), isNull(anomalies.resolvedAt)));
  const liveByKey = new Map(live.map((a) => [seriesId({ service: a.service, region: a.region }), a]));

  const deployRows = await db
    .select()
    .from(deploys)
    .where(eq(deploys.orgId, org.id))
    .orderBy(sql`${deploys.deployedAt} desc`)
    .limit(200);
  const markers: DeployMarker[] = deployRows.map((d) => ({
    id: d.id,
    serviceName: d.serviceName,
    sha: d.sha,
    deployedAt: d.deployedAt,
  }));
  const deployById = new Map(deployRows.map((d) => [d.id, d]));

  let opened = 0;
  let resolved = 0;

  for (const [id, entry] of series) {
    const cellList = profiles.get(id);
    if (!cellList || !profileIsTrustworthy(cellList)) continue;
    const profile = profileFromCells(cellList);
    const existing = liveByKey.get(id);

    const verdict = detect(entry.samples, profile);

    if (verdict) {
      const probableResources = await enrichContributors(account, entry.key, verdict.startedAt, end, verdict.hoursSustained);
      const correlated = plan(org.plan).deployCorrelation
        ? correlateDeploy(verdict.startedAt, markers)
        : null;

      if (existing) {
        await db
          .update(anomalies)
          .set({
            deltaPerDayMicros: verdict.deltaPerDayMicros,
            baselinePerDayMicros: verdict.baselinePerDayMicros,
            excessMicros: verdict.excessMicros,
            probableResources,
            correlatedDeployId: correlated?.id ?? existing.correlatedDeployId,
            lastEvaluatedAt: asOf,
          })
          .where(eq(anomalies.id, existing.id));
        continue;
      }

      const [created] = await db
        .insert(anomalies)
        .values({
          orgId: org.id,
          accountId: account.id,
          service: entry.key.service,
          region: entry.key.region,
          startedAt: verdict.startedAt,
          deltaPerDayMicros: verdict.deltaPerDayMicros,
          baselinePerDayMicros: verdict.baselinePerDayMicros,
          excessMicros: verdict.excessMicros,
          probableResources,
          correlatedDeployId: correlated?.id ?? null,
          lastEvaluatedAt: asOf,
        })
        // The partial unique index means a racing tick loses here, quietly.
        .onConflictDoNothing()
        .returning();
      if (!created) continue;

      opened += 1;
      await sendAnomalyAlert(org, account, created, {
        deploy: correlated ? deployById.get(correlated.id) ?? null : null,
        asOf,
      });
      continue;
    }

    if (existing && shouldResolve(entry.samples, profile)) {
      await db
        .update(anomalies)
        .set({ status: "resolved", resolvedAt: asOf, lastEvaluatedAt: asOf })
        .where(eq(anomalies.id, existing.id));
      resolved += 1;
    }
  }

  return { seriesEvaluated: series.size, opened, resolved };
}

/* ---------------------------------------------------------- anomaly alert */

export interface CardDeploy {
  sha: string;
  serviceName: string;
  commitUrl: string | null;
  deployedAt: Date;
}

export function anomalyCardInput(opts: {
  org: Org;
  account: AwsAccount;
  anomaly: Anomaly;
  deploy: CardDeploy | null;
  asOf: Date;
}): AnomalyCardInput {
  const base = env.appUrl.replace(/\/$/, "");
  return {
    anomalyId: opts.anomaly.id,
    service: opts.anomaly.service,
    region: opts.anomaly.region,
    accountLabel: opts.account.label,
    startedAt: opts.anomaly.startedAt,
    asOf: opts.asOf,
    deltaPerDayMicros: opts.anomaly.deltaPerDayMicros,
    deploy: opts.deploy
      ? {
          sha: opts.deploy.sha,
          serviceName: opts.deploy.serviceName,
          // Derived from the stored deploy time, never from the clock.
          leadTime: leadTimeLabel(opts.deploy.deployedAt, opts.anomaly.startedAt),
          commitUrl: opts.deploy.commitUrl,
        }
      : null,
    topContributor: opts.anomaly.probableResources[0]
      ? {
          label: opts.anomaly.probableResources[0].label,
          detail: opts.anomaly.probableResources[0].detail,
        }
      : null,
    trendImageUrl: `${base}/api/trend/${opts.anomaly.id}.png`,
    dashboardUrl: `${base}/anomalies/${opts.anomaly.id}`,
    demo: opts.account.provider === "demo",
  };
}

async function sendAnomalyAlert(
  org: Org,
  account: AwsAccount,
  anomaly: Anomaly,
  ctx: { deploy: CardDeploy | null; asOf: Date },
): Promise<void> {
  const db = getDb();
  const card = anomalyCardInput({ org, account, anomaly, deploy: ctx.deploy, asOf: ctx.asOf });
  const blocks = anomalyBlocks(card);
  const text = [
    `${shortServiceName(anomaly.service)} in ${anomaly.region} is ${formatPerDay(
      anomaly.deltaPerDayMicros,
    )} above its baseline.`,
    `Since ${stampUtc(anomaly.startedAt)}.`,
    ctx.deploy
      ? `Probable cause: deploy ${ctx.deploy.sha} of ${ctx.deploy.serviceName}, ${leadTimeLabel(
          ctx.deploy.deployedAt,
          anomaly.startedAt,
        )}.`
      : "No deploy in the 6h before onset.",
    `Account ${account.label}${account.provider === "demo" ? " (demo data)" : ""}.`,
    card.dashboardUrl,
  ].join("\n");

  const results = await dispatch({
    org,
    kind: "anomaly",
    dedupeKey: `anomaly:${anomaly.id}`,
    blocks,
    subject: anomalyNotificationText(card),
    text,
    summary: `${shortServiceName(anomaly.service)} — ${anomaly.region} ${formatPerDay(
      anomaly.deltaPerDayMicros,
    )}`,
  });

  const coordinates = slackCoordinates(results);
  if (coordinates) {
    await db
      .update(anomalies)
      .set({ slackChannelId: coordinates.channel, slackMessageTs: coordinates.ts })
      .where(eq(anomalies.id, anomaly.id));
  }
}

/* ---------------------------------------------------------------- budgets */

async function evaluateBudgets(org: Org, accounts: AwsAccount[], asOf: Date): Promise<number> {
  if (!plan(org.plan).budgets) return 0;
  const db = getDb();
  const rows = await db.select().from(budgets).where(eq(budgets.orgId, org.id));
  if (rows.length === 0) return 0;

  const accountIds = accounts.map((a) => a.id);
  const start = monthStart(asOf);
  const period = monthKey(asOf);
  let sent = 0;

  for (const budget of rows) {
    const spent = await budgetSpendMicros(budget, { from: start, to: asOf }, accountIds);
    const forecast = forecastMonth({
      mtdMicros: spent,
      asOf,
      // A budget projects on its own scope's history, not the estate's.
      recentDailyMicros: await scaledDailyRates(budget, accountIds, asOf),
    });
    const state = burnState({
      spentMicros: spent,
      limitMicros: budget.monthlyLimitMicros,
      forecast,
      asOf,
    });

    const alreadySent = await db
      .select({ threshold: budgetAlerts.threshold })
      .from(budgetAlerts)
      .where(and(eq(budgetAlerts.budgetId, budget.id), eq(budgetAlerts.periodStart, period)));
    const decision = nextRung({
      thresholds: budget.thresholds,
      fraction: state.fraction,
      projectedFraction: state.projectedFraction,
      alreadySent: alreadySent.map((r) => r.threshold),
    });
    if (!decision) continue;

    // Record the rung *and* every looser rung, so a jump from 0% to 130% can
    // never come back later and fire "80% used".
    await db
      .insert(budgetAlerts)
      .values(
        [decision.threshold, ...decision.superseded].map((threshold) => ({
          budgetId: budget.id,
          periodStart: period,
          threshold,
          spentMicros: spent,
          projectedMicros: forecast.projectedMicros,
        })),
      )
      .onConflictDoNothing();

    const message = rungMessage({
      budgetName: budget.name,
      decision,
      state,
      formatUsdWhole,
    });
    const base = env.appUrl.replace(/\/$/, "");
    const results = await dispatch({
      org,
      kind: "budget",
      dedupeKey: `budget:${budget.id}:${period}:${decision.threshold}`,
      blocks: budgetBlocks({
        budgetName: budget.name,
        message,
        scopeLabel: scopeLabel(budget.scope, budget.scopeValue),
        spentMicros: spent,
        limitMicros: budget.monthlyLimitMicros,
        projectedMicros: forecast.projectedMicros,
        daysRemaining: state.daysRemaining,
        dashboardUrl: `${base}/budgets`,
      }),
      subject: `Budget — ${budget.name}`,
      text: `${message}\n\n${base}/budgets`,
      summary: message,
    });
    if (results.some((r) => r.status === "sent" || r.status === "logged")) sent += 1;
  }

  return sent;
}

function startOfDay(d: Date): Date {
  return new Date(`${dayKey(d)}T00:00:00Z`);
}

/**
 * Daily totals restricted to a budget's scope. Budgets project on their own
 * history, not the estate's — otherwise a $200/mo service budget inside a
 * $40k estate is projected to blow up on day one.
 */
async function scaledDailyRates(
  budget: { orgId: string; scope: string; scopeValue: string },
  accountIds: string[],
  asOf: Date,
): Promise<number[]> {
  const out: number[] = [];
  const today = startOfDay(asOf);
  for (let i = 7; i >= 1; i--) {
    const from = addDays(today, -i);
    const to = addDays(today, -i + 1);
    out.push(await budgetSpendMicros(budget, { from, to }, accountIds));
  }
  return out.filter((v) => v > 0);
}

/* ----------------------------------------------------------------- waste */

async function maybeScanWaste(org: Org, account: AwsAccount, asOf: Date): Promise<number> {
  const fresh =
    account.lastWasteScanAt && asOf.getTime() - account.lastWasteScanAt.getTime() < WASTE_MAX_AGE_MS;
  if (fresh) return 0;

  const db = getDb();
  const provider = await providerFor(account);
  const scanned = await provider.fetchWaste(account);
  const stored = await db
    .select()
    .from(wasteFindings)
    .where(eq(wasteFindings.accountId, account.id));

  const merge = planMerge(
    stored.map((f) => ({
      resourceKey: f.resourceKey,
      kind: f.kind,
      status: f.status,
      estMonthlySavingMicros: f.estMonthlySavingMicros,
    })),
    scanned,
  );

  for (const finding of [...merge.insert, ...merge.update]) {
    await db
      .insert(wasteFindings)
      .values({
        orgId: org.id,
        accountId: account.id,
        kind: finding.kind,
        resourceKey: finding.resourceKey,
        title: finding.title,
        remedy: finding.remedy,
        region: finding.region,
        evidence: finding.evidence,
        resourceCount: finding.resourceCount,
        estMonthlySavingMicros: finding.estMonthlySavingMicros,
        lastSeenAt: asOf,
      })
      .onConflictDoUpdate({
        target: [wasteFindings.accountId, wasteFindings.kind, wasteFindings.resourceKey],
        set: {
          title: sql`excluded.title`,
          remedy: sql`excluded.remedy`,
          evidence: sql`excluded.evidence`,
          resourceCount: sql`excluded.resource_count`,
          estMonthlySavingMicros: sql`excluded.est_monthly_saving_micros`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }

  for (const key of merge.close) {
    const [kind, ...rest] = key.split(":");
    await db
      .update(wasteFindings)
      .set({ status: "done", closedAt: asOf })
      .where(
        and(
          eq(wasteFindings.accountId, account.id),
          eq(wasteFindings.kind, kind as never),
          eq(wasteFindings.resourceKey, rest.join(":")),
          eq(wasteFindings.status, "open"),
        ),
      );
  }

  await db
    .update(awsAccounts)
    .set({ lastWasteScanAt: asOf })
    .where(eq(awsAccounts.id, account.id));

  return merge.insert.length + merge.update.length;
}

/* ---------------------------------------------------------------- digest */

/** `2026-W29` — the ISO week key, for the weekly cadence. */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function maybeSendDigest(org: Org, accounts: AwsAccount[], asOf: Date): Promise<boolean> {
  const db = getDb();
  const accountIds = accounts.map((a) => a.id);
  const weekly = org.digestFrequency === "weekly";
  const period = weekly ? isoWeekKey(asOf) : dayKey(asOf);

  const start = monthStart(asOf);
  const mtd = await totalMicros(accountIds, { from: start, to: asOf });

  const lastMonth = previousMonthStart(asOf);
  const lastMonthTotal = await totalMicros(accountIds, {
    from: lastMonth,
    to: nextMonthStart(lastMonth),
  });
  // The same *window* of last month, so the comparison means something on the 5th.
  const elapsedMs = asOf.getTime() - start.getTime();
  const lastMonthToDate = await totalMicros(accountIds, {
    from: lastMonth,
    to: new Date(lastMonth.getTime() + elapsedMs),
  });

  const today = startOfDay(asOf);
  const daily = await dailyTotals(accountIds, { from: addDays(today, -7), to: today });
  const forecast = forecastMonth({
    mtdMicros: mtd,
    asOf,
    recentDailyMicros: daily.map((d) => d.micros),
  });

  const windowDays = weekly ? 7 : 1;
  const currentWindow = { from: addDays(today, -windowDays), to: today };
  const previousWindow = { from: addDays(today, -windowDays * 2), to: addDays(today, -windowDays) };
  const currentByService = await serviceOnlyTotals(accountIds, currentWindow);
  const previousByService = await serviceOnlyTotals(accountIds, previousWindow);
  const previousMap = new Map(previousByService.map((r) => [r.service, r.micros]));
  const movers = topMovers(
    currentByService.map((r) => ({
      key: shortServiceName(r.service),
      currentMicros: r.micros,
      previousMicros: previousMap.get(r.service) ?? 0,
    })),
  );

  const open = await db
    .select()
    .from(anomalies)
    .where(and(eq(anomalies.orgId, org.id), isNull(anomalies.resolvedAt)));

  const findings = await db.select().from(wasteFindings).where(eq(wasteFindings.orgId, org.id));
  const recoverable = recoverableMicros(
    rankFindings(
      findings.map((f) => ({
        kind: f.kind,
        estMonthlySavingMicros: f.estMonthlySavingMicros,
        status: f.status,
      })),
    ),
  );

  const digest = buildDigest({
    orgName: org.name,
    accountLabel: accounts[0]?.label ?? "—",
    asOf,
    frequency: weekly ? "weekly" : "daily",
    mtdMicros: mtd,
    forecast,
    lastMonthTotalMicros: lastMonthTotal,
    lastMonthToDateMicros: lastMonthToDate,
    movers,
    openAnomalies: open.map((a) => ({
      service: a.service,
      region: a.region,
      deltaPerDayMicros: a.deltaPerDayMicros,
    })),
    recoverableMicros: recoverable,
    demo: accounts.every((a) => a.provider === "demo"),
  });

  const base = env.appUrl.replace(/\/$/, "");
  const results = await dispatch({
    org,
    kind: "digest",
    dedupeKey: `digest:${period}`,
    blocks: digestBlocks({
      headline: digest.headline,
      spendLine: digest.spendLine,
      forecastLine: digest.forecastLine,
      moverLines: digest.moverLines,
      anomalyLines: digest.anomalyLines,
      wasteLine: digest.wasteLine,
      dashboardUrl: `${base}/watch`,
      accountLabel: accounts[0]?.label ?? "—",
    }),
    subject: `${digest.headline} — ${formatUsd(mtd)} MTD`,
    text: `${digestToText(digest)}\n\n${base}/watch`,
    summary: digest.summary,
  });

  return results.some((r) => r.status === "sent" || r.status === "logged");
}
