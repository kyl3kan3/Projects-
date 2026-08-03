/**
 * The read path — every query a page needs, in one place, all scoped to an
 * organization (or, for the public changelog, to a published entry).
 *
 * The verdict a screen shows is always **derived from the findings that exist
 * now**, never from a status column a background job was supposed to have
 * reconciled. `diffs.verdict` is stored because a timeline row should not have
 * to load a hundred findings to render one word, but it is written in the same
 * transaction as the findings and re-written whenever they are, so it cannot go
 * stale on its own.
 */

import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  acknowledgements,
  apis,
  auditLog,
  changelogEntries,
  checkRuns,
  consumerImpacts,
  consumers,
  contractSuites,
  deploys,
  diffs,
  findings,
  organizations,
  subscriptions,
  type ChangelogEntry,
  type Consumer,
  type Deploy,
  type Environment,
  type FindingRow,
  type Organization,
  type WatchedApi,
} from "@/db/schema";
import { historyCutoff, PLANS } from "@/lib/plans";
import { normalizeUsage, type DeclaredUsage } from "@/core/impact";
import type { DiffLine } from "@/core/rules";

/* --------------------------------------------------------------- API list */

export interface ApiListRow {
  api: WatchedApi;
  deployCount: number;
  lastPushedAt: Date | null;
  lastVerdict: "breaking" | "risky" | "compatible" | null;
  latestDiffId: string | null;
  consumerCount: number;
  draftCount: number;
}

export async function listApis(organizationId: string): Promise<ApiListRow[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(apis)
    .where(eq(apis.organizationId, organizationId))
    .orderBy(asc(apis.createdAt), asc(apis.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const deployStats = await db
    .select({
      apiId: deploys.apiId,
      count: sql<number>`count(*)::int`,
      last: sql<Date | null>`max(${deploys.pushedAt})`,
    })
    .from(deploys)
    .where(inArray(deploys.apiId, ids))
    .groupBy(deploys.apiId);

  const latestDiffs = await db
    .select({ id: diffs.id, apiId: diffs.apiId, verdict: diffs.verdict, computedAt: diffs.computedAt })
    .from(diffs)
    .where(inArray(diffs.apiId, ids))
    .orderBy(desc(diffs.computedAt));

  const consumerStats = await db
    .select({ apiId: consumers.apiId, count: sql<number>`count(*)::int` })
    .from(consumers)
    .where(inArray(consumers.apiId, ids))
    .groupBy(consumers.apiId);

  const draftStats = await db
    .select({ apiId: changelogEntries.apiId, count: sql<number>`count(*)::int` })
    .from(changelogEntries)
    .where(and(inArray(changelogEntries.apiId, ids), eq(changelogEntries.status, "draft")))
    .groupBy(changelogEntries.apiId);

  const firstDiff = new Map<string, { id: string; verdict: ApiListRow["lastVerdict"] }>();
  for (const d of latestDiffs) if (!firstDiff.has(d.apiId)) firstDiff.set(d.apiId, { id: d.id, verdict: d.verdict });

  return rows.map((api) => {
    const stats = deployStats.find((s) => s.apiId === api.id);
    const latest = firstDiff.get(api.id);
    return {
      api,
      deployCount: stats?.count ?? 0,
      lastPushedAt: stats?.last ? new Date(stats.last) : null,
      lastVerdict: latest?.verdict ?? null,
      latestDiffId: latest?.id ?? null,
      consumerCount: consumerStats.find((s) => s.apiId === api.id)?.count ?? 0,
      draftCount: draftStats.find((s) => s.apiId === api.id)?.count ?? 0,
    };
  });
}

export async function getApiBySlug(organizationId: string, slug: string): Promise<WatchedApi | null> {
  const [row] = await getDb()
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, organizationId), eq(apis.slug, slug)));
  return row ?? null;
}

/* --------------------------------------------------------------- timeline */

export interface TimelineRow {
  deploy: Deploy;
  isBaseline: boolean;
  /** The diff in which this deploy is the *new* side. */
  diffId: string | null;
  verdict: "breaking" | "risky" | "compatible" | null;
  summary: { breaking: number; risky: number; compatible: number; info: number } | null;
  health: { score: number; operations: number };
}

export async function getTimeline(
  api: WatchedApi,
  plan: Organization["plan"],
  environment?: Environment,
  limit = 60,
): Promise<TimelineRow[]> {
  const db = getDb();
  const cutoff = historyCutoff(plan, new Date());
  const conditions = [eq(deploys.apiId, api.id), gte(deploys.pushedAt, cutoff)];
  if (environment) conditions.push(eq(deploys.environment, environment));

  const rows = await db
    .select()
    .from(deploys)
    .where(and(...conditions))
    .orderBy(desc(deploys.pushedAt))
    .limit(limit);
  if (rows.length === 0) return [];

  const diffRows = await db
    .select()
    .from(diffs)
    .where(
      and(
        eq(diffs.apiId, api.id),
        inArray(
          diffs.toDeployId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .orderBy(desc(diffs.computedAt));

  return rows.map((deploy) => {
    const diff = diffRows.find((d) => d.toDeployId === deploy.id);
    const health = (deploy.specHealth ?? {}) as { score?: number; operations?: number };
    return {
      deploy,
      isBaseline: api.baselineDeployId === deploy.id,
      diffId: diff?.id ?? null,
      verdict: diff?.verdict ?? null,
      summary: (diff?.summary as TimelineRow["summary"]) ?? null,
      health: { score: health.score ?? 0, operations: health.operations ?? 0 },
    };
  });
}

export async function environmentCounts(apiId: string): Promise<Record<Environment, number>> {
  const rows = await getDb()
    .select({ environment: deploys.environment, count: sql<number>`count(*)::int` })
    .from(deploys)
    .where(eq(deploys.apiId, apiId))
    .groupBy(deploys.environment);
  const out: Record<Environment, number> = { prod: 0, staging: 0, pr: 0 };
  for (const r of rows) out[r.environment] = r.count;
  return out;
}

/* ------------------------------------------------------------------- diffs */

export interface DiffFinding {
  id: string;
  ordinal: number;
  ruleId: string;
  level: "breaking" | "risky" | "compatible" | "info";
  defaultLevel: "breaking" | "risky" | "compatible" | "info";
  jsonPointer: string;
  endpoint: string | null;
  method: string | null;
  side: "request" | "response" | "operation";
  fieldPath: string | null;
  message: string;
  why: string;
  diffLines: DiffLine[];
  impactedConsumers: string[];
  acknowledged: boolean;
}

export interface DiffDetail {
  id: string;
  apiId: string;
  apiSlug: string;
  apiName: string;
  verdict: "breaking" | "risky" | "compatible";
  summary: { breaking: number; risky: number; compatible: number; info: number; total: number };
  engineVersion: string;
  computedAt: Date;
  fromDeploy: Deploy;
  toDeploy: Deploy;
  findings: DiffFinding[];
  impacts: Array<{
    consumerId: string;
    name: string;
    impacted: boolean;
    worst: "breaking" | "risky" | "compatible" | null;
    details: Array<{ findingIndex: number; ruleId: string; level: string; message: string; reason: string }>;
  }>;
  /** The draft awaiting publication for this diff, when there is one. */
  draft: ChangelogEntry | null;
  failsPolicy: boolean;
  /** `owner/repo#number` when the new side came from a pull request. */
  prRef: string | null;
}

export async function getDiff(organizationId: string, diffId: string): Promise<DiffDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({ diff: diffs, api: apis })
    .from(diffs)
    .innerJoin(apis, eq(diffs.apiId, apis.id))
    .where(and(eq(diffs.id, diffId), eq(apis.organizationId, organizationId)));
  if (!row) return null;

  const [fromDeploy] = await db.select().from(deploys).where(eq(deploys.id, row.diff.fromDeployId));
  const [toDeploy] = await db.select().from(deploys).where(eq(deploys.id, row.diff.toDeployId));
  if (!fromDeploy || !toDeploy) return null;

  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.diffId, row.diff.id))
    .orderBy(asc(findings.ordinal));

  const impactRows = await db
    .select({ impact: consumerImpacts, consumer: consumers })
    .from(consumerImpacts)
    .innerJoin(consumers, eq(consumerImpacts.consumerId, consumers.id))
    .where(eq(consumerImpacts.diffId, row.diff.id))
    .orderBy(asc(consumers.name));

  const impacts = impactRows.map((r) => ({
    consumerId: r.consumer.id,
    name: r.consumer.name,
    impacted: r.impact.impacted,
    worst: r.impact.worst,
    details: (r.impact.details ?? []) as DiffDetail["impacts"][number]["details"],
  }));

  const [draft] = await db.select().from(changelogEntries).where(eq(changelogEntries.diffId, row.diff.id));

  const policy = (row.api.policy ?? {}) as { failOn?: string };
  const failsPolicy =
    policy.failOn === "risky" ? row.diff.verdict !== "compatible" : row.diff.verdict === "breaking";

  return {
    id: row.diff.id,
    apiId: row.api.id,
    apiSlug: row.api.slug,
    apiName: row.api.name,
    verdict: row.diff.verdict,
    summary: row.diff.summary as DiffDetail["summary"],
    engineVersion: row.diff.engineVersion,
    computedAt: row.diff.computedAt,
    fromDeploy,
    toDeploy,
    findings: findingRows.map((f: FindingRow, index) => ({
      id: f.id,
      ordinal: f.ordinal,
      ruleId: f.ruleId,
      level: f.level,
      defaultLevel: f.defaultLevel,
      jsonPointer: f.jsonPointer,
      endpoint: f.endpoint,
      method: f.method,
      side: f.side,
      fieldPath: f.fieldPath,
      message: f.message,
      why: f.why,
      diffLines: (f.diffLines ?? []) as DiffLine[],
      acknowledged: f.level === "info",
      impactedConsumers: impacts
        .filter((i) =>
          i.details.some((d) => d.findingIndex === index && (d.level === "breaking" || d.level === "risky")),
        )
        .map((i) => i.name),
    })),
    impacts,
    draft: draft ?? null,
    failsPolicy,
    prRef: toDeploy.prRef,
  };
}

/** The newest diff for an API — where the dashboard's Diff tab lands. */
export async function getLatestDiffId(apiId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: diffs.id })
    .from(diffs)
    .where(eq(diffs.apiId, apiId))
    .orderBy(desc(diffs.computedAt))
    .limit(1);
  return row?.id ?? null;
}

export async function getDeployById(apiId: string, deployId: string): Promise<Deploy | null> {
  const [row] = await getDb()
    .select()
    .from(deploys)
    .where(and(eq(deploys.apiId, apiId), eq(deploys.id, deployId)));
  return row ?? null;
}

export async function findDiffForPair(fromDeployId: string, toDeployId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: diffs.id })
    .from(diffs)
    .where(and(eq(diffs.fromDeployId, fromDeployId), eq(diffs.toDeployId, toDeployId)));
  return row?.id ?? null;
}

/* --------------------------------------------------------------- consumers */

export interface ConsumerRow {
  consumer: Consumer;
  usage: DeclaredUsage;
  /** How many of the last diffs marked this consumer impacted. */
  impactedCount: number;
  lastImpactedAt: Date | null;
}

export async function listConsumers(apiId: string): Promise<ConsumerRow[]> {
  const db = getDb();
  const rows = await db.select().from(consumers).where(eq(consumers.apiId, apiId)).orderBy(asc(consumers.name));
  if (rows.length === 0) return [];

  const impacts = await db
    .select({
      consumerId: consumerImpacts.consumerId,
      count: sql<number>`count(*)::int`,
      last: sql<Date | null>`max(${diffs.computedAt})`,
    })
    .from(consumerImpacts)
    .innerJoin(diffs, eq(consumerImpacts.diffId, diffs.id))
    .where(
      and(
        eq(consumerImpacts.impacted, true),
        inArray(
          consumerImpacts.consumerId,
          rows.map((r) => r.id),
        ),
      ),
    )
    .groupBy(consumerImpacts.consumerId);

  return rows.map((consumer) => {
    const stat = impacts.find((i) => i.consumerId === consumer.id);
    return {
      consumer,
      usage: normalizeUsage(consumer.declaredUsage),
      impactedCount: stat?.count ?? 0,
      lastImpactedAt: stat?.last ? new Date(stat.last) : null,
    };
  });
}

export async function getConsumer(apiId: string, consumerId: string): Promise<Consumer | null> {
  const [row] = await getDb()
    .select()
    .from(consumers)
    .where(and(eq(consumers.apiId, apiId), eq(consumers.id, consumerId)));
  return row ?? null;
}

/* --------------------------------------------------------------- changelog */

export async function listChangelog(apiId: string): Promise<ChangelogEntry[]> {
  return getDb()
    .select()
    .from(changelogEntries)
    .where(eq(changelogEntries.apiId, apiId))
    .orderBy(desc(changelogEntries.createdAt));
}

export interface PublicChangelog {
  org: Organization;
  api: WatchedApi;
  entries: ChangelogEntry[];
  subscriberCount: number;
}

/**
 * The public page. Only `public` and `unlisted` APIs resolve — `private` returns
 * null so a slug guess cannot leak a changelog. `unlisted` resolves but is
 * excluded from the sitemap.
 */
export async function getPublicChangelog(orgSlug: string, apiSlug: string): Promise<PublicChangelog | null> {
  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!org) return null;
  const [api] = await db
    .select()
    .from(apis)
    .where(and(eq(apis.organizationId, org.id), eq(apis.slug, apiSlug)));
  if (!api || api.visibility === "private") return null;

  const entries = await db
    .select()
    .from(changelogEntries)
    .where(and(eq(changelogEntries.apiId, api.id), eq(changelogEntries.status, "published")))
    .orderBy(desc(changelogEntries.publishedAt));

  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(and(eq(subscriptions.apiId, api.id), isNotNull(subscriptions.verifiedAt)));

  return { org, api, entries, subscriberCount: count?.n ?? 0 };
}

/** Every public API, for the sitemap. */
export async function listPublicApis(): Promise<Array<{ orgSlug: string; apiSlug: string; updatedAt: Date }>> {
  const rows = await getDb()
    .select({
      orgSlug: organizations.slug,
      apiSlug: apis.slug,
      updatedAt: sql<Date | null>`max(${changelogEntries.publishedAt})`,
    })
    .from(apis)
    .innerJoin(organizations, eq(apis.organizationId, organizations.id))
    .innerJoin(changelogEntries, eq(changelogEntries.apiId, apis.id))
    .where(and(eq(apis.visibility, "public"), eq(changelogEntries.status, "published")))
    .groupBy(organizations.slug, apis.slug);
  return rows.map((r) => ({ orgSlug: r.orgSlug, apiSlug: r.apiSlug, updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date() }));
}

/* ------------------------------------------------------ suites, acks, audit */

export async function listContractSuites(apiId: string) {
  return getDb()
    .select({ suite: contractSuites, consumer: consumers })
    .from(contractSuites)
    .leftJoin(consumers, eq(contractSuites.consumerId, consumers.id))
    .where(eq(contractSuites.apiId, apiId))
    .orderBy(desc(contractSuites.generatedAt));
}

export async function listAcknowledgements(apiId: string) {
  return getDb()
    .select()
    .from(acknowledgements)
    .where(eq(acknowledgements.apiId, apiId))
    .orderBy(desc(acknowledgements.createdAt));
}

export async function listCheckRuns(apiId: string, limit = 20) {
  return getDb()
    .select()
    .from(checkRuns)
    .where(eq(checkRuns.apiId, apiId))
    .orderBy(desc(checkRuns.updatedAt))
    .limit(limit);
}

export async function listAudit(organizationId: string, limit = 40) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function listSubscriptions(apiId: string) {
  return getDb()
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.apiId, apiId))
    .orderBy(desc(subscriptions.createdAt));
}

/** Plan state for gate calls in server actions. */
export async function planState(org: Organization) {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(apis)
    .where(eq(apis.organizationId, org.id));
  return { plan: org.plan, trialEndsAt: org.trialEndsAt, apiCount: row?.count ?? 0 };
}

export { PLANS };
