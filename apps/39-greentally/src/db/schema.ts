/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema — the data model from ARCHITECTURE.md, one table per bullet.
 * Migrations are generated from this file (`npm run db:generate`).
 *
 * Four conventions worth reading before the rest:
 *
 *  1. **Physical quantities are integers, in thousandths.** `quantityMilli` holds
 *     kWh × 1000 or litres × 1000; `emission_results.gco2e` holds grams CO2e.
 *     A footprint is an audited figure that has to reproduce exactly on recompute,
 *     and float accumulation across 400 activity lines does not. Factors are
 *     `kgco2ePerUnitMicro` — kgCO2e per unit × 1 000 000 — which keeps six decimal
 *     places of a published factor without a decimal point.
 *
 *  2. **Money is integer cents** (`amountCents`), rounded once at the CSV edge.
 *
 *  3. **Confidence is basis points** (integer 0–10 000) wherever it is compared
 *     against a threshold. A float comparison at the boundary is a coin toss.
 *
 *  4. **Service periods are `date`, not `timestamptz`.** A bill covering
 *     "MAR 01–31" is a pair of calendar dates; storing them as instants files a
 *     March bill into February for anyone west of UTC.
 *
 * Tenancy is `organizationId` on every domain table, including tables that could
 * reach it through a join — a query that needs three joins to learn whose row it is
 * will eventually be written without them.
 */

import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums --- */

/**
 * `preview` is the unpaid state, not an absence of one: a free org gets the
 * footprint preview (one bill, partial Scope 2, blurred report) and every gate in
 * lib/plans.ts reads from this column.
 */
export const planEnum = pgEnum("plan", ["preview", "starter", "standard", "supplier_plus"]);
export const billingIntervalEnum = pgEnum("billing_interval", ["month", "year"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "member"]);
export const periodStatusEnum = pgEnum("period_status", ["collecting", "review", "complete"]);

export const documentKindEnum = pgEnum("document_kind", [
  "electricity_bill",
  "gas_bill",
  "fuel_receipt",
  "spend_csv",
  "other",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "uploaded",
  "extracting",
  "needs_review",
  "accepted",
  "rejected",
  "failed",
]);

/** Canonical activity categories. Electricity and gas in kWh, liquid fuels in litres. */
export const activityCategoryEnum = pgEnum("activity_category", [
  "electricity_kwh",
  "natural_gas_kwh",
  "diesel_l",
  "petrol_l",
  "heating_oil_l",
  "propane_l",
]);

export const factorSetEnum = pgEnum("factor_set", [
  "epa_2025",
  "egrid_2024",
  "defra_2025",
  "useeio_v2",
  "contractual",
]);

export const scopeEnum = pgEnum("scope", ["1", "2_location", "2_market", "3_spend"]);

export const frameworkEnum = pgEnum("framework", ["cdp_style", "ecovadis_style", "custom"]);
export const answerStatusEnum = pgEnum("answer_status", ["draft", "ready"]);
export const classificationSourceEnum = pgEnum("classification_source", ["auto", "user"]);
export const reportKindEnum = pgEnum("report_kind", ["csrd_lite"]);

export const marketMethodEnum = pgEnum("market_method", ["residual_mix", "renewable_contract"]);

export const jobKindEnum = pgEnum("job_kind", [
  "extract_document",
  "classify_spend",
  "compute_footprint",
]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed"]);

/* ---------------------------------------------------------- organizations --- */

export interface OrgSettings {
  /** Report cover contact — printed on the CSRD-lite PDF. */
  contactName: string;
  contactEmail: string;
  /** Standard+ only: a wordmark line on the report cover. No image uploads in v1. */
  reportWordmark: string;
  /** Which questionnaires the onboarding wizard said they have to answer. */
  frameworks: ("cdp_style" | "ecovadis_style" | "custom")[];
  /** Saved GL column mapping, so the second CSV import is one click. */
  spendMapping: {
    description: string;
    amount: string;
    glAccount: string;
    date: string;
  } | null;
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  contactName: "",
  contactEmail: "",
  reportWordmark: "",
  frameworks: ["cdp_style"],
  spendMapping: null,
};

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  plan: planEnum().notNull().default("preview"),
  billingInterval: billingIntervalEnum(),
  stripeCustomerId: text(),
  stripeSubscriptionId: text(),
  /** NAICS code — printed on the report boundary page, not used in the maths. */
  industryCode: text().notNull().default(""),
  industryLabel: text().notNull().default(""),
  /** Reporting-year revenue in cents. Integer money, no exceptions. */
  annualRevenueCents: bigint({ mode: "number" }).notNull().default(0),
  fteCount: integer().notNull().default(0),
  reportingCurrency: text().notNull().default("USD"),
  settings: jsonb().$type<OrgSettings>().notNull().default(DEFAULT_ORG_SETTINGS),
  onboardedAt: timestamp({ withTimezone: true }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text().notNull(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    role: orgRoleEnum().notNull().default("owner"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/* ------------------------------------------------------------------ sites --- */

export const sites = pgTable(
  "sites",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text().notNull(),
    address: text().notNull().default(""),
    /** ISO 3166-1 alpha-2. Chooses the fuel factor set (US → EPA, GB → DEFRA). */
    country: text().notNull().default("US"),
    /** eGRID subregion (US) or national grid code (e.g. `GB`). */
    gridRegion: text().notNull(),
    floorAreaSqm: integer().notNull().default(0),
    /** How Scope 2 market-based is claimed for this site. */
    marketMethod: marketMethodEnum().notNull().default("residual_mix"),
    /** 0–100. The share of electricity covered by contractual instruments. */
    renewableSharePct: integer().notNull().default(0),
    contractNote: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sites_org_idx").on(t.organizationId)],
);

/* ------------------------------------------------------- reporting periods --- */

/**
 * `snapshot` is the materialized dashboard read: totals by scope, by site, by
 * month, coverage. It is written by the engine and never by a form, so a stale
 * snapshot is a bug in one place rather than everywhere.
 */
export interface PeriodSnapshot {
  engineVersion: string;
  computedAt: string;
  gco2eByScope: Record<string, number>;
  gco2eBySite: Record<string, number>;
  /** "2025-03" → grams. Scope 1 + Scope 2 location only; spend has no month. */
  gco2eByMonth: Record<string, number>;
  monthsWithData: number;
  monthsComplete: number;
  monthsPartial: number;
  activityLineCount: number;
  spendLineCount: number;
  spendClassifiedCount: number;
}

export const reportingPeriods = pgTable(
  "reporting_periods",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    year: integer().notNull(),
    status: periodStatusEnum().notNull().default("collecting"),
    lockedAt: timestamp({ withTimezone: true }),
    snapshot: jsonb().$type<PeriodSnapshot | null>(),
    snapshotAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("periods_org_year_unique").on(t.organizationId, t.year)],
);

/* -------------------------------------------------------------- documents --- */

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    siteId: uuid().references(() => sites.id, { onDelete: "set null" }),
    periodId: uuid()
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "cascade" }),
    storageKey: text().notNull(),
    filename: text().notNull(),
    mimeType: text().notNull(),
    byteSize: integer().notNull(),
    contentHash: text().notNull(),
    kind: documentKindEnum().notNull(),
    status: documentStatusEnum().notNull().default("uploaded"),
    /** Lowest per-field confidence, basis points. Null until extraction runs. */
    confidenceBp: integer(),
    /** Which extractor produced the reading: "anthropic" | "deterministic". */
    extractor: text(),
    extractorModel: text(),
    /** Microcents (millionths of a cent) — a bill page costs under one cent. */
    costMicrocents: bigint({ mode: "number" }).notNull().default(0),
    error: text(),
    provider: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("documents_org_status_idx").on(t.organizationId, t.status),
    index("documents_period_idx").on(t.periodId),
    uniqueIndex("documents_org_hash_unique").on(t.organizationId, t.contentHash),
  ],
);

/**
 * Original bytes when object storage is not configured.
 *
 * Split from `documents` on purpose: a list query must never drag a megabyte of PDF
 * into memory, and Postgres will not decompress a column nobody selected.
 */
export const documentBlobs = pgTable("document_blobs", {
  documentId: uuid()
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  /** base64. Text rather than bytea so the rows survive a logical dump/restore. */
  data: text().notNull(),
});

/* ---------------------------------------------------------- activity lines --- */

/** Per-field confidence in basis points. */
export interface FieldConfidences {
  quantity?: number;
  period?: number;
  provider?: number;
  category?: number;
}

/** What the reader actually saw for each field — drawn in the review panel. */
export interface FieldEvidence {
  quantity?: string;
  period?: string;
  provider?: string;
}

export const activityLines = pgTable(
  "activity_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    periodId: uuid()
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "cascade" }),
    category: activityCategoryEnum().notNull(),
    /** Canonical quantity × 1000 (kWh or litres). Integer, always. */
    quantityMilli: bigint({ mode: "number" }).notNull(),
    unit: text().notNull(),
    /** What the bill actually printed, kept for the audit trail. */
    sourceQuantity: text().notNull().default(""),
    sourceUnit: text().notNull().default(""),
    serviceStart: date().notNull(),
    serviceEnd: date().notNull(),
    provider: text().notNull().default(""),
    fieldConfidences: jsonb().$type<FieldConfidences>().notNull().default({}),
    evidence: jsonb().$type<FieldEvidence>().notNull().default({}),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_period_site_idx").on(t.periodId, t.siteId),
    index("activity_document_idx").on(t.documentId),
  ],
);

/* ------------------------------------------------------------- spend lines --- */

export const spendLines = pgTable(
  "spend_lines",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid()
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    periodId: uuid()
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "cascade" }),
    rowNumber: integer().notNull(),
    description: text().notNull(),
    amountCents: bigint({ mode: "number" }).notNull(),
    currency: text().notNull().default("USD"),
    glAccount: text().notNull().default(""),
    spendDate: date(),
    /** USEEIO category slug. Null until classified. */
    eeioCategory: text(),
    classificationSource: classificationSourceEnum(),
    classificationConfidenceBp: integer(),
    classificationReason: text().notNull().default(""),
    excluded: boolean().notNull().default(false),
    exclusionReason: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("spend_period_idx").on(t.periodId), index("spend_document_idx").on(t.documentId)],
);

/* -------------------------------------------------------- emission factors --- */

export const emissionFactors = pgTable(
  "emission_factors",
  {
    id: uuid().primaryKey().defaultRandom(),
    factorSet: factorSetEnum().notNull(),
    /** Activity category slug or EEIO category slug. */
    category: text().notNull(),
    region: text().notNull(),
    unit: text().notNull(),
    /** kgCO2e per unit × 1 000 000. Six decimals of a published factor, no floats. */
    kgco2ePerUnitMicro: bigint({ mode: "number" }).notNull(),
    vintage: text().notNull(),
    citation: text().notNull(),
    /** Which scope this factor is legitimate for. */
    scope: scopeEnum().notNull(),
    label: text().notNull().default(""),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("factors_unique").on(t.factorSet, t.category, t.region, t.vintage),
    index("factors_lookup_idx").on(t.scope, t.category, t.region),
  ],
);

/* -------------------------------------------------------- emission results --- */

export const emissionResults = pgTable(
  "emission_results",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodId: uuid()
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "cascade" }),
    siteId: uuid().references(() => sites.id, { onDelete: "cascade" }),
    scope: scopeEnum().notNull(),
    category: text().notNull(),
    /** Grams CO2e. Integer — the whole engine is integer arithmetic. */
    gco2e: bigint({ mode: "number" }).notNull(),
    factorId: uuid().references(() => emissionFactors.id, { onDelete: "restrict" }),
    activityLineId: uuid().references(() => activityLines.id, { onDelete: "cascade" }),
    spendLineId: uuid().references(() => spendLines.id, { onDelete: "cascade" }),
    /** The multiplicand, restated so the arithmetic can be shown without a join. */
    quantityMilli: bigint({ mode: "number" }).notNull().default(0),
    unit: text().notNull().default(""),
    /** "2025-03" for monthly attribution; empty for Scope 3 spend. */
    month: text().notNull().default(""),
    computedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    engineVersion: text().notNull(),
  },
  (t) => [
    index("results_period_scope_idx").on(t.periodId, t.scope),
    index("results_period_site_idx").on(t.periodId, t.siteId),
  ],
);

/* ----------------------------------------------------------------- reports --- */

export interface ReportTotals {
  engineVersion: string;
  year: number;
  scope1Gco2e: number;
  scope2LocationGco2e: number;
  scope2MarketGco2e: number;
  scope3SpendGco2e: number;
  /** Reported total uses market-based Scope 2, per GHG Protocol dual reporting. */
  totalMarketGco2e: number;
  totalLocationGco2e: number;
  /** tCO2e per million of reporting currency, × 1000 (so 0.001 t resolution). */
  intensityPerRevenueMilli: number;
  /** tCO2e per FTE, × 1000. */
  intensityPerFteMilli: number;
  monthsComplete: number;
  coveragePct: number;
  factorCitations: { label: string; citation: string; vintage: string }[];
}

export const reports = pgTable(
  "reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodId: uuid()
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "cascade" }),
    kind: reportKindEnum().notNull().default("csrd_lite"),
    storageKey: text(),
    totalsSnapshot: jsonb().$type<ReportTotals>().notNull(),
    renderedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_period_idx").on(t.periodId)],
);

/* --------------------------------------------------- questionnaire answers --- */

export interface AnswerSourceRef {
  kind: "figure" | "factor" | "document" | "boundary";
  label: string;
  detail: string;
}

export const questionnaireAnswers = pgTable(
  "questionnaire_answers",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodId: uuid()
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "cascade" }),
    framework: frameworkEnum().notNull(),
    questionKey: text().notNull(),
    questionText: text().notNull(),
    /** Rendered from the template + current figures on every regeneration. */
    answerText: text().notNull(),
    /**
     * Operator prose appended to the generated answer. Kept apart from
     * `answerText` so regenerating never silently overwrites an edit — and so an
     * edit can never rewrite a figure.
     */
    toneNote: text().notNull().default(""),
    sourceRefs: jsonb().$type<AnswerSourceRef[]>().notNull().default([]),
    status: answerStatusEnum().notNull().default("draft"),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("answers_unique").on(t.periodId, t.framework, t.questionKey),
    index("answers_period_idx").on(t.periodId),
  ],
);

/* --------------------------------------------------------------- audit log --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "system" or a user id. */
    actor: text().notNull(),
    actorLabel: text().notNull().default(""),
    action: text().notNull(),
    target: text(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_idx").on(t.organizationId, t.createdAt)],
);

/* -------------------------------------------------------------------- jobs --- */

/**
 * The work queue, in Postgres.
 *
 * ARCHITECTURE.md called for BullMQ on Redis behind a long-lived worker. The
 * deployment target is Vercel + Neon, where there is no always-on process and Hobby
 * cron fires once a day, so the queue lives in the database instead and is drained
 * by three callers sharing one code path: `/api/jobs/run` (the browser, right after
 * an upload), `/api/cron/tick` (the scheduled sweep), and `npm run worker` (a
 * long-lived process if you deploy one). One less service, and enqueueing happens
 * in the same transaction as the row it is about.
 *
 * Claiming is done by the database, never by comparing a JS `Date` against
 * `run_at` — see lib/jobs.ts.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: jobKindEnum().notNull(),
    payload: jsonb().$type<Record<string, string>>().notNull(),
    status: jobStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    maxAttempts: integer().notNull().default(3),
    runAt: timestamp({ withTimezone: true })
      .notNull()
      .default(sql`now()`),
    startedAt: timestamp({ withTimezone: true }),
    finishedAt: timestamp({ withTimezone: true }),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_claim_idx").on(t.status, t.runAt), index("jobs_org_idx").on(t.organizationId)],
);

/* -------------------------------------------------------------- relations --- */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  sites: many(sites),
  periods: many(reportingPeriods),
  documents: many(documents),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [sites.organizationId],
    references: [organizations.id],
  }),
  activityLines: many(activityLines),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.organizationId],
    references: [organizations.id],
  }),
  site: one(sites, { fields: [documents.siteId], references: [sites.id] }),
  period: one(reportingPeriods, {
    fields: [documents.periodId],
    references: [reportingPeriods.id],
  }),
  activityLines: many(activityLines),
  spendLines: many(spendLines),
}));

export const activityLinesRelations = relations(activityLines, ({ one }) => ({
  document: one(documents, { fields: [activityLines.documentId], references: [documents.id] }),
  site: one(sites, { fields: [activityLines.siteId], references: [sites.id] }),
}));

export const emissionResultsRelations = relations(emissionResults, ({ one }) => ({
  factor: one(emissionFactors, {
    fields: [emissionResults.factorId],
    references: [emissionFactors.id],
  }),
  activityLine: one(activityLines, {
    fields: [emissionResults.activityLineId],
    references: [activityLines.id],
  }),
  spendLine: one(spendLines, {
    fields: [emissionResults.spendLineId],
    references: [spendLines.id],
  }),
  site: one(sites, { fields: [emissionResults.siteId], references: [sites.id] }),
}));

/* ------------------------------------------------------------------ types --- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type ReportingPeriod = typeof reportingPeriods.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type ActivityLine = typeof activityLines.$inferSelect;
export type NewActivityLine = typeof activityLines.$inferInsert;
export type SpendLine = typeof spendLines.$inferSelect;
export type NewSpendLine = typeof spendLines.$inferInsert;
export type EmissionFactor = typeof emissionFactors.$inferSelect;
export type EmissionResult = typeof emissionResults.$inferSelect;
export type NewEmissionResult = typeof emissionResults.$inferInsert;
export type Report = typeof reports.$inferSelect;
export type QuestionnaireAnswer = typeof questionnaireAnswers.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type Job = typeof jobs.$inferSelect;

export type Plan = (typeof planEnum.enumValues)[number];
export type BillingInterval = (typeof billingIntervalEnum.enumValues)[number];
export type DocumentKind = (typeof documentKindEnum.enumValues)[number];
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];
export type ActivityCategory = (typeof activityCategoryEnum.enumValues)[number];
export type FactorSet = (typeof factorSetEnum.enumValues)[number];
export type Scope = (typeof scopeEnum.enumValues)[number];
export type Framework = (typeof frameworkEnum.enumValues)[number];
export type PeriodStatus = (typeof periodStatusEnum.enumValues)[number];
export type JobKind = (typeof jobKindEnum.enumValues)[number];
export type MarketMethod = (typeof marketMethodEnum.enumValues)[number];
