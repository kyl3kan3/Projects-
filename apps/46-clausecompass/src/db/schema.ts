/**
 * src/db/schema.ts
 *
 * Drizzle schema — the single source of truth for ARCHITECTURE.md's data model.
 * Migrations come from `npm run db:generate`.
 *
 * Two invariants live in the schema rather than only in code, because they are the
 * product's trust story and code drifts:
 *
 *  1. `clauses.source_spans` is a non-empty jsonb array (CHECK constraint in
 *     drizzle/0001_invariants.sql). Nothing unanchored may be stored, so nothing
 *     unanchored can render.
 *  2. `flags` carries a unique index over (contract_id, rule_key, clause_id) so a
 *     re-run of the scorer can never double-flag the same clause with the same
 *     rung of a threshold ladder.
 *
 * Credit balance is deliberately NOT a column on accounts. It is derived from the
 * purchases ledger every time it is read: a cached counter is the classic way to
 * show a customer a number that stopped being true three refunds ago.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- enums */

export const planEnum = pgEnum("plan", ["per_contract", "freelancer", "studio"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "member"]);
export const contractStatusEnum = pgEnum("contract_status", [
  "uploaded",
  "parsing",
  "extracting",
  "scoring",
  "explaining",
  "ready",
  "failed",
]);
export const contractTypeEnum = pgEnum("contract_type", [
  "msa",
  "sow",
  "nda",
  "vendor",
  "lease",
  "other",
]);
export const clauseTypeEnum = pgEnum("clause_type", [
  "payment_terms",
  "ip_assignment",
  "indemnity",
  "non_compete",
  "auto_renewal",
  "termination",
  "liability_cap",
  "confidentiality",
  "warranties",
  "governing_law",
  "late_fees",
  "scope_revisions",
  "boilerplate",
  "other",
]);
export const severityEnum = pgEnum("severity", ["ok", "caution", "high"]);
export const purchaseKindEnum = pgEnum("purchase_kind", [
  "subscription_grant",
  "one_time",
  "overage",
  "trial",
]);
export const sourceKindEnum = pgEnum("source_kind", ["pdf", "docx", "text"]);

export type Plan = (typeof planEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type ContractStatus = (typeof contractStatusEnum.enumValues)[number];
export type ContractType = (typeof contractTypeEnum.enumValues)[number];
export type ClauseType = (typeof clauseTypeEnum.enumValues)[number];
export type Severity = (typeof severityEnum.enumValues)[number];
export type PurchaseKind = (typeof purchaseKindEnum.enumValues)[number];
export type SourceKind = (typeof sourceKindEnum.enumValues)[number];

/* --------------------------------------------------------- shared shapes */

/** A verbatim quote plus where it sits in the parsed text. Validated at ingest. */
export interface SourceSpan {
  page: number;
  startOffset: number;
  endOffset: number;
  quote: string;
}

/** One parsed block of the document, with global offset bookkeeping. */
export interface ContractBlock {
  page: number;
  offset: number;
  kind: "heading" | "para" | "list";
  text: string;
  ref?: string;
}

export interface SectionEntry {
  ref: string;
  heading: string;
  blockIndex: number;
  page: number;
}

/** How each numbered section was accounted for. Gaps surface in the report. */
export type CoverageDisposition = "clause" | "boilerplate" | "not_analyzed";

export interface CoverageEntry {
  ref: string;
  heading: string;
  page: number;
  disposition: CoverageDisposition;
  clauseType?: ClauseType;
}

export interface RuleComparator {
  /** Which extracted field the rule reads. `null` for presence/absence rules. */
  field: string | null;
  op:
    | "gt" // numeric field greater than threshold
    | "gte"
    | "lt"
    | "lte"
    | "eq"
    | "is_true"
    | "is_false"
    | "present" // a clause of this type exists at all
    | "absent"; // no clause of this type was found
  threshold?: number | string | boolean | null;
  /** Rules sharing a ladder key fire only at their tightest crossed rung. */
  ladder?: string;
}

/* -------------------------------------------------------------- accounts */

export const accounts = pgTable("accounts", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  plan: planEnum().notNull().default("per_contract"),
  stripeCustomerId: text(),
  stripeSubscriptionId: text(),
  /** Not-legal-advice acknowledgment. No review may run without it. */
  disclaimerAckAt: timestamp({ withTimezone: true }),
  /** Retention window in days; the sweep deletes contract + report at expiry. */
  retentionDays: integer().notNull().default(90),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text().notNull(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    role: userRoleEnum().notNull().default("owner"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email), index("users_account_idx").on(t.accountId)],
);

/* ------------------------------------------------------------- playbooks */

export const playbooks = pgTable(
  "playbooks",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** null = the built-in default playbook, shared by every account. */
    accountId: uuid().references(() => accounts.id, { onDelete: "cascade" }),
    name: text().notNull(),
    version: integer().notNull().default(1),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playbooks_account_idx").on(t.accountId, t.active)],
);

export const playbookRules = pgTable(
  "playbook_rules",
  {
    id: uuid().primaryKey().defaultRandom(),
    playbookId: uuid()
      .notNull()
      .references(() => playbooks.id, { onDelete: "cascade" }),
    clauseType: clauseTypeEnum().notNull(),
    ruleKey: text().notNull(),
    title: text().notNull(),
    comparator: jsonb().$type<RuleComparator>().notNull(),
    severityOnFail: severityEnum().notNull(),
    /** Rendered with {{value}} / {{threshold}} into flags.fired_because. */
    firedTemplate: text().notNull(),
    /** Fallback plain-English copy when the explanation pass cannot run. */
    explanationTemplate: text().notNull(),
    forYouTemplate: text().notNull(),
    marketNote: text().notNull(),
    redlineTemplate: text().notNull(),
    /** Editable by Studio accounts; the built-in default is read-only. */
    threshold: real(),
    enabled: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex("playbook_rules_key").on(t.playbookId, t.ruleKey),
    index("playbook_rules_playbook_idx").on(t.playbookId),
  ],
);

/* ------------------------------------------------------------- contracts */

export const contracts = pgTable(
  "contracts",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text().notNull(),
    counterparty: text(),
    contractType: contractTypeEnum().notNull().default("other"),
    /** User confirmed the detected type (the detector is a guess, not a fact). */
    typeConfirmed: boolean().notNull().default(false),
    status: contractStatusEnum().notNull().default("uploaded"),
    sourceKind: sourceKindEnum().notNull(),
    sourceFilename: text(),
    sha256: text().notNull(),
    pageCount: integer().notNull().default(1),
    sizeBytes: integer().notNull().default(0),
    playbookId: uuid().references(() => playbooks.id, { onDelete: "set null" }),
    playbookVersion: integer(),
    playbookName: text(),
    modelVersion: text(),
    /** Which purchase row this review's credit came from, so it can be refunded. */
    creditPurchaseId: uuid(),
    failureReason: text(),
    /** Set when a stage is claimed; a stale claim is retried by the cron tick. */
    stageStartedAt: timestamp({ withTimezone: true }),
    stageAttempts: integer().notNull().default(0),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costMicros: integer().notNull().default(0),
    retentionExpiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("contracts_account_status_idx").on(t.accountId, t.status),
    index("contracts_retention_idx").on(t.retentionExpiresAt),
    index("contracts_sha_idx").on(t.accountId, t.sha256),
  ],
);

export const contractTexts = pgTable(
  "contract_texts",
  {
    id: uuid().primaryKey().defaultRandom(),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    fullText: text().notNull(),
    blocks: jsonb().$type<ContractBlock[]>().notNull(),
    sectionMap: jsonb().$type<SectionEntry[]>().notNull(),
    parseWarnings: jsonb().$type<string[]>().notNull().default([]),
    coverage: jsonb().$type<CoverageEntry[]>().notNull().default([]),
    charCount: integer().notNull().default(0),
  },
  (t) => [uniqueIndex("contract_texts_contract_key").on(t.contractId)],
);

export const clauses = pgTable(
  "clauses",
  {
    id: uuid().primaryKey().defaultRandom(),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    clauseType: clauseTypeEnum().notNull(),
    heading: text(),
    sectionRef: text(),
    /** Non-empty by CHECK constraint — the anchoring invariant. */
    sourceSpans: jsonb().$type<SourceSpan[]>().notNull(),
    extractedFields: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    confidence: real().notNull().default(1),
    rawModelOutput: jsonb(),
    modelVersion: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clauses_contract_idx").on(t.contractId, t.clauseType)],
);

export const flags = pgTable(
  "flags",
  {
    id: uuid().primaryKey().defaultRandom(),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    /** null for missing-clause flags: there is no clause to point at. */
    clauseId: uuid().references(() => clauses.id, { onDelete: "cascade" }),
    ruleId: uuid().references(() => playbookRules.id, { onDelete: "set null" }),
    ruleKey: text().notNull(),
    clauseType: clauseTypeEnum().notNull(),
    severity: severityEnum().notNull(),
    title: text().notNull(),
    firedBecause: text().notNull(),
    explanation: text(),
    forYou: text(),
    market: text(),
    /** HIGH flags carry the standing "worth a real lawyer" pointer. */
    lawyerPointer: boolean().notNull().default(false),
    /** generated | template | failed — the report says which. */
    explanationSource: text().notNull().default("template"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("flags_contract_severity_idx").on(t.contractId, t.severity)],
);

export const redlines = pgTable(
  "redlines",
  {
    id: uuid().primaryKey().defaultRandom(),
    flagId: uuid()
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    originalPhrase: text().notNull(),
    suggestedText: text().notNull(),
    rationale: text().notNull(),
    emailSnippet: text().notNull(),
    /** Accepted redlines are what the requested-changes email is built from. */
    accepted: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("redlines_flag_key").on(t.flagId)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    contractId: uuid()
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    shareToken: text(),
    shareRevokedAt: timestamp({ withTimezone: true }),
    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    playbookVersion: integer().notNull(),
    playbookName: text().notNull(),
    modelVersion: text().notNull(),
    coverage: jsonb()
      .$type<{ sections: number; analyzed: number; boilerplate: number; notAnalyzed: number }>()
      .notNull(),
    summary: jsonb().$type<{ high: number; caution: number; ok: number }>().notNull(),
  },
  (t) => [
    uniqueIndex("reports_contract_key").on(t.contractId),
    uniqueIndex("reports_share_token_key").on(t.shareToken),
  ],
);

/* -------------------------------------------------------------- billing */

export const purchases = pgTable(
  "purchases",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: purchaseKindEnum().notNull(),
    credits: integer().notNull(),
    /** FIFO consumption: the soonest-expiring grant is spent first. */
    creditsUsed: integer().notNull().default(0),
    amountCents: integer().notNull().default(0),
    stripeRef: text(),
    note: text(),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("purchases_account_idx").on(t.accountId, t.expiresAt),
    uniqueIndex("purchases_stripe_ref_key").on(t.stripeRef),
  ],
);

/** Processed Stripe event ids — the webhook is idempotent by table lookup. */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------- other */

export const evalCases = pgTable(
  "eval_cases",
  {
    id: uuid().primaryKey().defaultRandom(),
    fixtureKey: text().notNull(),
    name: text().notNull(),
    contractType: contractTypeEnum().notNull(),
    expectedFlags: jsonb().$type<string[]>().notNull(),
    lastRunAt: timestamp({ withTimezone: true }),
    lastResult: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [uniqueIndex("eval_cases_key").on(t.fixtureKey)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    actor: text().notNull(),
    action: text().notNull(),
    target: text().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_account_idx").on(t.accountId, t.createdAt)],
);

/** Free clause checker throttle: one row per request, pruned by the daily tick. */
export const checkerHits = pgTable(
  "checker_hits",
  {
    id: uuid().primaryKey().defaultRandom(),
    ipHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checker_hits_ip_idx").on(t.ipHash, t.createdAt)],
);

/* ------------------------------------------------------------ row types */

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type Playbook = typeof playbooks.$inferSelect;
export type PlaybookRule = typeof playbookRules.$inferSelect;
export type Contract = typeof contracts.$inferSelect;
export type ContractText = typeof contractTexts.$inferSelect;
export type Clause = typeof clauses.$inferSelect;
export type Flag = typeof flags.$inferSelect;
export type Redline = typeof redlines.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type EvalCase = typeof evalCases.$inferSelect;
