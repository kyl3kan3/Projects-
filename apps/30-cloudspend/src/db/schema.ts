/**
 * Drizzle schema — the data model in ARCHITECTURE.md.
 *
 * Money: every amount is an integer number of **micro-dollars** (1e-6 USD) in a
 * `bigint` column. Cloud line items are genuinely sub-cent ($0.0043 for an hour
 * of a small volume), so cents would round the input away; floats would drift
 * across the millions of rows a month of hourly facts produces. Rounding
 * happens exactly once, at the display edge (`src/lib/money.ts`).
 *
 * `cost_facts` is the append-heavy table. ARCHITECTURE.md calls for monthly
 * partitions; this build keeps it a single table with a composite
 * (account_id, ts) index, which is the right shape up to tens of millions of
 * rows. Converting to `PARTITION BY RANGE (ts)` is an operational migration
 * (create partitioned parent, attach, backfill) rather than a product change,
 * so it is deliberately not in the MVP.
 */

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ orgs */

export const PLAN_IDS = ["solo", "startup", "scale"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const orgs = pgTable("orgs", {
  id: id(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  plan: text().notNull().default("solo").$type<PlanId>(),
  /** Stripe subscription state: trialing | active | past_due | canceled. */
  billingStatus: text().notNull().default("trialing"),
  trialEndsAt: timestamp({ withTimezone: true }),
  stripeCustomerId: text(),
  stripeSubscriptionId: text(),
  /** Slack workspace connection (the bot token is workspace-scoped). */
  slackTeamId: text(),
  slackTeamName: text(),
  slackBotToken: text(),
  slackChannelId: text(),
  slackChannelName: text(),
  /** Shared secret for the generic/GitHub deploy webhook. */
  deployWebhookToken: text().notNull(),
  deployWebhookSecret: text().notNull(),
  /** daily | weekly — which digest cadence this org gets. */
  digestFrequency: text().notNull().default("daily"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text().notNull().unique(),
  name: text(),
  passwordHash: text().notNull(),
  createdAt: createdAt(),
});

export const members = pgTable(
  "members",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().notNull().default("owner"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("members_org_user_idx").on(t.orgId, t.userId)],
);

/* ---------------------------------------------------------- aws accounts */

export const CONNECT_STATUSES = ["pending", "verified", "error"] as const;
export type ConnectStatus = (typeof CONNECT_STATUSES)[number];

export const awsAccounts = pgTable(
  "aws_accounts",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** 12-digit AWS account id. */
    accountId: text().notNull(),
    label: text().notNull(),
    roleArn: text().notNull(),
    externalId: text().notNull(),
    regions: text().array().notNull().default(sql`'{}'::text[]`),
    connectStatus: text().notNull().default("pending").$type<ConnectStatus>(),
    connectError: text(),
    verifiedAt: timestamp({ withTimezone: true }),
    /** "aws" once a real assume-role succeeded; "demo" for the synthetic feed. */
    provider: text().notNull().default("aws"),
    curBucket: text(),
    curPrefix: text(),
    curLastImportedAt: timestamp({ withTimezone: true }),
    backfilledAt: timestamp({ withTimezone: true }),
    lastIngestAt: timestamp({ withTimezone: true }),
    /** Highest fact hour ingested, so the next poll knows where to resume. */
    ingestedThrough: timestamp({ withTimezone: true }),
    lastWasteScanAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("aws_accounts_org_account_idx").on(t.orgId, t.accountId)],
);

/* ------------------------------------------------------------- tag sets */

export const tagSets = pgTable(
  "tag_sets",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Canonical `k=v|k=v` of the sorted tag pairs; "-" means untagged. */
    hash: text().notNull(),
    tags: jsonb().notNull().$type<Record<string, string>>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tag_sets_org_hash_idx").on(t.orgId, t.hash)],
);

/* ----------------------------------------------------------- cost facts */

export const COST_SOURCES = ["ce", "cur"] as const;
export type CostSource = (typeof COST_SOURCES)[number];

export const costFacts = pgTable(
  "cost_facts",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => awsAccounts.id, { onDelete: "cascade" }),
    /** Start of the hour the cost was incurred, UTC. */
    ts: timestamp({ withTimezone: true }).notNull(),
    service: text().notNull(),
    region: text().notNull(),
    usageType: text().notNull(),
    /** Matches `tag_sets.hash`; "-" for untagged spend. */
    tagHash: text().notNull().default("-"),
    resourceId: text(),
    amountMicros: bigint({ mode: "number" }).notNull(),
    source: text().notNull().default("ce").$type<CostSource>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("cost_facts_grain_idx").on(
      t.accountId,
      t.ts,
      t.service,
      t.region,
      t.usageType,
      t.tagHash,
      t.source,
    ),
    index("cost_facts_account_ts_idx").on(t.accountId, t.ts),
    index("cost_facts_org_ts_idx").on(t.orgId, t.ts),
  ],
);

/* ------------------------------------------------------------ baselines */

/**
 * Seasonality-aware baseline: one row per (account, service, day-of-week, hour).
 * A Tuesday 14:00 reading is judged against previous Tuesdays at 14:00, which is
 * what stops a nightly batch job alerting every night.
 */
export const baselines = pgTable(
  "baselines",
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => awsAccounts.id, { onDelete: "cascade" }),
    service: text().notNull(),
    dow: integer().notNull(),
    hour: integer().notNull(),
    meanMicros: bigint({ mode: "number" }).notNull(),
    stddevMicros: bigint({ mode: "number" }).notNull(),
    samples: integer().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("baselines_grain_idx").on(t.accountId, t.service, t.dow, t.hour)],
);

/* ------------------------------------------------------------ anomalies */

export const ANOMALY_STATUSES = ["open", "acked", "resolved"] as const;
export type AnomalyStatus = (typeof ANOMALY_STATUSES)[number];

export interface ProbableResource {
  label: string;
  detail: string;
  deltaPerDayMicros: number;
}

export const anomalies = pgTable(
  "anomalies",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => awsAccounts.id, { onDelete: "cascade" }),
    service: text().notNull(),
    region: text().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    detectedAt: createdAt(),
    /** Deviation above baseline, projected to a day. */
    deltaPerDayMicros: bigint({ mode: "number" }).notNull(),
    baselinePerDayMicros: bigint({ mode: "number" }).notNull(),
    /** Total excess accumulated since onset — recomputed each evaluation. */
    excessMicros: bigint({ mode: "number" }).notNull().default(0),
    status: text().notNull().default("open").$type<AnomalyStatus>(),
    probableResources: jsonb().notNull().default(sql`'[]'::jsonb`).$type<ProbableResource[]>(),
    correlatedDeployId: uuid(),
    ackedBy: text(),
    ackedAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    lastEvaluatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Slack message coordinates, so Ack can update the message in place. */
    slackChannelId: text(),
    slackMessageTs: text(),
  },
  (t) => [
    /**
     * At most one live anomaly per service+region per account. Postgres treats
     * NULLs as distinct in a unique index, so `resolved_at` doubles as the
     * partition key: open/acked rows have NULL and collide, resolved rows don't.
     */
    uniqueIndex("anomalies_live_idx")
      .on(t.accountId, t.service, t.region)
      .where(sql`resolved_at is null`),
    index("anomalies_org_status_idx").on(t.orgId, t.status),
  ],
);

/* -------------------------------------------------------------- deploys */

export const deploys = pgTable(
  "deploys",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    serviceName: text().notNull(),
    sha: text().notNull(),
    deployedAt: timestamp({ withTimezone: true }).notNull(),
    /** github | webhook */
    source: text().notNull().default("webhook"),
    repo: text(),
    commitUrl: text(),
    actor: text(),
    environment: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("deploys_org_sha_idx").on(t.orgId, t.serviceName, t.sha, t.deployedAt),
    index("deploys_org_time_idx").on(t.orgId, t.deployedAt),
  ],
);

/* -------------------------------------------------------------- budgets */

export const BUDGET_SCOPES = ["service", "tag", "account"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    scope: text().notNull().$type<BudgetScope>(),
    /** Service name, `k=v` tag pair, or an aws_accounts.id, per `scope`. */
    scopeValue: text().notNull(),
    monthlyLimitMicros: bigint({ mode: "number" }).notNull(),
    /** Percentages of the limit at which to warn, e.g. {50,80,100}. */
    thresholds: integer().array().notNull().default(sql`'{80,100}'::integer[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budgets_org_scope_idx").on(t.orgId, t.scope, t.scopeValue)],
);

/**
 * One row per (budget, month, threshold) that has fired. The unique index is
 * what stops a daily sweep re-sending the same rung forever, and the ladder
 * logic picks the *tightest* crossed rung so 80% firing never silences 100%.
 */
export const budgetAlerts = pgTable(
  "budget_alerts",
  {
    id: id(),
    budgetId: uuid()
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    /** First day of the budget month, as `YYYY-MM-01`. */
    periodStart: text().notNull(),
    threshold: integer().notNull(),
    spentMicros: bigint({ mode: "number" }).notNull(),
    projectedMicros: bigint({ mode: "number" }).notNull(),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_alerts_rung_idx").on(t.budgetId, t.periodStart, t.threshold)],
);

/* ------------------------------------------------------- waste findings */

export const WASTE_KINDS = [
  "idle_instance",
  "unattached_ebs",
  "old_snapshot",
  "oversized",
] as const;
export type WasteKind = (typeof WASTE_KINDS)[number];

export const WASTE_STATUSES = ["open", "done", "dismissed"] as const;
export type WasteStatus = (typeof WASTE_STATUSES)[number];

export const wasteFindings = pgTable(
  "waste_findings",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    accountId: uuid()
      .notNull()
      .references(() => awsAccounts.id, { onDelete: "cascade" }),
    kind: text().notNull().$type<WasteKind>(),
    /** Grouped findings use a synthetic key, e.g. `snapshots:older-than-180d`. */
    resourceKey: text().notNull(),
    title: text().notNull(),
    remedy: text().notNull(),
    region: text().notNull(),
    evidence: text().notNull(),
    resourceCount: integer().notNull().default(1),
    estMonthlySavingMicros: bigint({ mode: "number" }).notNull(),
    status: text().notNull().default("open").$type<WasteStatus>(),
    firstSeenAt: createdAt(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("waste_findings_resource_idx").on(t.accountId, t.kind, t.resourceKey)],
);

/* -------------------------------------------------------- alert plumbing */

export const alertChannels = pgTable(
  "alert_channels",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** slack | email */
    kind: text().notNull(),
    /** Slack channel id, or an email address. */
    target: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("alert_channels_target_idx").on(t.orgId, t.kind, t.target)],
);

export const ALERT_KINDS = ["anomaly", "budget", "digest"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/**
 * Delivery history *and* the send-once ledger. `dedupeKey` is unique per org and
 * channel: anomalies use `anomaly:<id>`, budgets `budget:<id>:<month>:<rung>`,
 * digests `digest:<period>`. A sweep that runs twice sends nothing twice.
 */
export const alertLog = pgTable(
  "alert_log",
  {
    id: id(),
    orgId: uuid()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    kind: text().notNull().$type<AlertKind>(),
    dedupeKey: text().notNull(),
    channelKind: text().notNull(),
    channelTarget: text().notNull(),
    /** sent | logged | failed — "logged" means no Slack token was configured. */
    status: text().notNull(),
    summary: text().notNull(),
    error: text(),
    externalId: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("alert_log_dedupe_idx").on(t.orgId, t.dedupeKey, t.channelTarget),
    index("alert_log_org_time_idx").on(t.orgId, t.createdAt),
  ],
);

/* ----------------------------------------------------------------- types */

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type AwsAccount = typeof awsAccounts.$inferSelect;
export type CostFact = typeof costFacts.$inferSelect;
export type Baseline = typeof baselines.$inferSelect;
export type Anomaly = typeof anomalies.$inferSelect;
export type Deploy = typeof deploys.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type WasteFinding = typeof wasteFindings.$inferSelect;
export type AlertChannel = typeof alertChannels.$inferSelect;
export type AlertLogRow = typeof alertLog.$inferSelect;
