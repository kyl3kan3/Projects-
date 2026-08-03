/**
 * Drizzle schema — the single source of truth for the data model in
 * ARCHITECTURE.md. Migrations are generated from this file (`npm run
 * db:generate`).
 *
 * Two conventions run through it:
 *
 *  - **Tenancy.** Org-owned tables carry `organizationId`; the jurisdiction /
 *    requirement corpus is global and shared by every tenant.
 *  - **Versioning, not mutation.** A requirement record is never edited in
 *    place. A new row is inserted and the old one gets `supersededBy` set, so
 *    a checklist pinned to v3 keeps reading v3 forever. The partial unique
 *    index below is what makes "the current record" a database guarantee
 *    rather than a hope.
 *
 * Money is integer cents everywhere. Dates that matter to a human (expiry,
 * verification) are timestamptz and compared by Postgres, never by JS.
 */

import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
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

/* ------------------------------------------------------------------ *
 * Enums
 * ------------------------------------------------------------------ */

export const planEnum = pgEnum("plan", ["crew", "company", "regional"]);
export const planIntervalEnum = pgEnum("plan_interval", ["month", "year"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "member"]);
export const coverageStatusEnum = pgEnum("coverage_status", ["curated", "partial", "requested"]);
export const jurisdictionKindEnum = pgEnum("jurisdiction_kind", [
  "city",
  "county",
  "state",
  "special_district",
]);
export const permitExpiryBasisEnum = pgEnum("permit_expiry_basis", ["issuance", "last_inspection"]);
export const sourceStatusEnum = pgEnum("source_status", ["active", "broken", "paused"]);
export const sourceKindEnum = pgEnum("source_kind", [
  "official_page",
  "phone_confirmation",
  "contribution",
]);
export const changeOriginEnum = pgEnum("change_origin", ["crawl_diff", "contribution", "curator"]);
export const reviewStateEnum = pgEnum("review_state", ["pending", "approved", "rejected"]);
export const contributionReviewStateEnum = pgEnum("contribution_review_state", [
  "pending",
  "accepted",
  "rejected",
]);
export const jobStatusEnum = pgEnum("job_status", ["active", "closed"]);
export const checklistItemKindEnum = pgEnum("checklist_item_kind", [
  "permit",
  "document",
  "fee",
  "inspection_note",
  "license_check",
]);
export const verificationStateEnum = pgEnum("verification_state", ["open", "verified", "na"]);
export const applicationStatusEnum = pgEnum("application_status", [
  "not_submitted",
  "in_review",
  "issued",
  "expired",
  "stop_work",
]);
export const inspectionResultEnum = pgEnum("inspection_result", ["pending", "passed", "failed"]);
export const credentialKindEnum = pgEnum("credential_kind", [
  "contractor_license",
  "trade_registration",
  "business_license",
  "insurance_cert",
]);
export const expirySubjectTypeEnum = pgEnum("expiry_subject_type", ["license", "permit_application"]);
export const expiryAlertTierEnum = pgEnum("expiry_alert_tier", ["t60", "t30", "t7", "t1"]);
/**
 * `skipped` is the rung that only ever existed in the past. A licence added
 * eleven days before it lapses has no honest T-60 to send, and pretending
 * otherwise is how a ladder either spams or goes silent. Such a subject gets
 * one catch-up notice at the tightest crossed rung; the looser ones are
 * recorded as skipped so nothing re-plans them tomorrow.
 */
export const alertStateEnum = pgEnum("alert_state", ["scheduled", "sent", "skipped", "cancelled"]);

/* ------------------------------------------------------------------ *
 * Tenant tables
 * ------------------------------------------------------------------ */

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  plan: planEnum().notNull().default("crew"),
  planInterval: planIntervalEnum().notNull().default("month"),
  tradeFocus: text(),
  stripeCustomerId: text(),
  stripeSubscriptionId: text(),
  /** Mirror of Stripe's own status string; entitlement decisions read it. */
  subscriptionStatus: text(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  trialEndsAt: timestamp({ withTimezone: true }),
  /** Accepted-contribution credit, integer cents, applied against invoices. */
  contributionCreditCents: integer().notNull().default(0),
  settings: jsonb().$type<OrgSettings>().notNull().default({}),
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
    name: text(),
    passwordHash: text().notNull(),
    role: orgRoleEnum().notNull().default("member"),
    /** Curators reach the admin console; contractors never see it. */
    isCurator: boolean().notNull().default(false),
    contributorReputation: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_org_idx").on(t.organizationId),
  ],
);

/* ------------------------------------------------------------------ *
 * Shared corpus
 * ------------------------------------------------------------------ */

export const jurisdictions = pgTable(
  "jurisdictions",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    slug: text().notNull(),
    state: text().notNull(),
    county: text(),
    kind: jurisdictionKindEnum().notNull().default("city"),
    departmentName: text().notNull(),
    contact: jsonb().$type<JurisdictionContact>().notNull().default({}),
    portalUrl: text(),
    coverageStatus: coverageStatusEnum().notNull().default("requested"),
    /**
     * Permit expiry rule, inherited by every permit issued here: how many days
     * a permit stays alive, and whether the clock restarts on inspection.
     */
    permitValidDays: integer().notNull().default(180),
    permitExpiryBasis: permitExpiryBasisEnum().notNull().default("last_inspection"),
    curatedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("jurisdictions_slug_unique").on(t.slug)],
);

export const jurisdictionSources = pgTable(
  "jurisdiction_sources",
  {
    id: uuid().primaryKey().defaultRandom(),
    jurisdictionId: uuid()
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "cascade" }),
    url: text().notNull(),
    label: text().notNull(),
    /** Content-region hint for cheerio; falls back to <main> then <body>. */
    selector: text(),
    crawlFrequencyHours: integer().notNull().default(72),
    lastCrawledAt: timestamp({ withTimezone: true }),
    lastSnapshotHash: text(),
    lastSnapshot: text(),
    status: sourceStatusEnum().notNull().default("active"),
    /** Three consecutive failures marks the source broken, loudly. */
    failureCount: integer().notNull().default(0),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sources_due_idx").on(t.status, t.lastCrawledAt),
    index("sources_jurisdiction_idx").on(t.jurisdictionId),
  ],
);

export const requirementRecords = pgTable(
  "requirement_records",
  {
    id: uuid().primaryKey().defaultRandom(),
    jurisdictionId: uuid()
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "cascade" }),
    jobType: text().notNull(),
    permitsRequired: jsonb().$type<string[]>().notNull().default([]),
    submittalRequirements: jsonb().$type<SubmittalRequirement[]>().notNull().default([]),
    fees: jsonb().$type<FeeLine[]>().notNull().default([]),
    reviewTimeline: text().notNull(),
    quirks: text(),
    /** Inspection desk guidance — the thing nobody writes down. */
    inspectionContact: text(),
    inspectionLeadTimeDays: integer(),
    reinspectionFeeCents: integer(),
    version: integer().notNull().default(1),
    sourceId: uuid().references(() => jurisdictionSources.id, { onDelete: "set null" }),
    sourceKind: sourceKindEnum().notNull().default("official_page"),
    verifiedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Human-readable verifier ("Dana Whitfield, curator") — always shown. */
    verifiedBy: text().notNull(),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    /** The version chain. NULL means "this is the current record". */
    supersededBy: uuid().references((): AnyPgColumn => requirementRecords.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /**
     * At most one current record per (jurisdiction, job type). Without this a
     * double publish leaves two "current" rows and checklist generation starts
     * picking whichever one the planner felt like.
     */
    uniqueIndex("requirement_current_unique")
      .on(t.jurisdictionId, t.jobType)
      .where(sql`superseded_by is null`),
    index("requirement_pair_idx").on(t.jurisdictionId, t.jobType),
    index("requirement_superseded_idx").on(t.supersededBy),
  ],
);

export const requirementChanges = pgTable(
  "requirement_changes",
  {
    id: uuid().primaryKey().defaultRandom(),
    jurisdictionId: uuid()
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "cascade" }),
    /** Set when the change is approved and a new version exists. */
    requirementRecordId: uuid().references(() => requirementRecords.id, { onDelete: "set null" }),
    previousRecordId: uuid().references(() => requirementRecords.id, { onDelete: "set null" }),
    sourceId: uuid().references(() => jurisdictionSources.id, { onDelete: "set null" }),
    jobType: text(),
    origin: changeOriginEnum().notNull(),
    diffSummary: text().notNull(),
    rawDiff: text(),
    reviewState: reviewStateEnum().notNull().default("pending"),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    rejectionReason: text(),
    alertedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("changes_review_idx").on(t.reviewState, t.createdAt),
    index("changes_jurisdiction_idx").on(t.jurisdictionId),
  ],
);

/** Which orgs hear about a jurisdiction's changes. Metered by plan. */
export const jurisdictionWatches = pgTable(
  "jurisdiction_watches",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jurisdictionId: uuid()
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("watch_unique").on(t.organizationId, t.jurisdictionId),
    index("watch_jurisdiction_idx").on(t.jurisdictionId),
  ],
);

/** The honest "not covered yet" path — it files rather than guesses. */
export const coverageRequests = pgTable(
  "coverage_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jurisdictionId: uuid().references(() => jurisdictions.id, { onDelete: "set null" }),
    jurisdictionName: text(),
    jobType: text().notNull(),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("coverage_requests_org_idx").on(t.organizationId)],
);

/* ------------------------------------------------------------------ *
 * Jobs, checklists, applications
 * ------------------------------------------------------------------ */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text().notNull(),
    siteAddress: text().notNull(),
    jurisdictionId: uuid()
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "restrict" }),
    jobType: text().notNull(),
    status: jobStatusEnum().notNull().default("active"),
    assignedUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("jobs_org_status_idx").on(t.organizationId, t.status),
    index("jobs_jurisdiction_idx").on(t.jurisdictionId),
  ],
);

export const permitChecklists = pgTable(
  "permit_checklists",
  {
    id: uuid().primaryKey().defaultRandom(),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** Pinned at generation: a later rule change never rewrites an open job. */
    requirementRecordId: uuid()
      .notNull()
      .references(() => requirementRecords.id, { onDelete: "restrict" }),
    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    fullyStampedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex("checklist_job_unique").on(t.jobId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    checklistId: uuid()
      .notNull()
      .references(() => permitChecklists.id, { onDelete: "cascade" }),
    kind: checklistItemKindEnum().notNull(),
    title: text().notNull(),
    detail: text().notNull(),
    state: verificationStateEnum().notNull().default("open"),
    naReason: text(),
    verifiedByUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp({ withTimezone: true }),
    position: integer().notNull().default(0),
    /** Stable identity across regeneration, so stamps survive a new version. */
    slug: text().notNull(),
  },
  (t) => [
    index("checklist_items_checklist_idx").on(t.checklistId, t.position),
    uniqueIndex("checklist_items_slug_unique").on(t.checklistId, t.slug),
  ],
);

export const permitApplications = pgTable(
  "permit_applications",
  {
    id: uuid().primaryKey().defaultRandom(),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    permitName: text().notNull(),
    jurisdictionRefNumber: text(),
    status: applicationStatusEnum().notNull().default("not_submitted"),
    statusHistory: jsonb().$type<StatusEvent[]>().notNull().default([]),
    submittedAt: timestamp({ withTimezone: true }),
    issuedAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("applications_job_idx").on(t.jobId),
    index("applications_expiry_idx").on(t.status, t.expiresAt),
  ],
);

export const inspections = pgTable(
  "inspections",
  {
    id: uuid().primaryKey().defaultRandom(),
    permitApplicationId: uuid()
      .notNull()
      .references(() => permitApplications.id, { onDelete: "cascade" }),
    inspectionType: text().notNull(),
    scheduledFor: timestamp({ withTimezone: true }),
    /** Who to call, what they ask for, the trick that gets you on the list. */
    contactNotes: text(),
    leadTimeDays: integer(),
    result: inspectionResultEnum().notNull().default("pending"),
    reinspectionFeeCents: integer(),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("inspections_application_idx").on(t.permitApplicationId)],
);

/* ------------------------------------------------------------------ *
 * The org's own papers
 * ------------------------------------------------------------------ */

export const licensesAndCredentials = pgTable(
  "licenses_and_credentials",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: credentialKindEnum().notNull(),
    issuingAuthority: text().notNull(),
    number: text().notNull(),
    holder: text().notNull(),
    /**
     * No stored "expired" flag. Expiry is a fact about a date, derived at read
     * time — a status column reconciled by a sweep reads "current" on a licence
     * that lapsed in March.
     */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    renewalUrl: text(),
    assignedUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("licenses_org_expiry_idx").on(t.organizationId, t.expiresAt)],
);

export const expiryAlerts = pgTable(
  "expiry_alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subjectType: expirySubjectTypeEnum().notNull(),
    subjectId: uuid().notNull(),
    tier: expiryAlertTierEnum().notNull(),
    scheduledFor: timestamp({ withTimezone: true }).notNull(),
    /** The expiry this rung was planned against; a renewal invalidates it. */
    subjectExpiresAt: timestamp({ withTimezone: true }).notNull(),
    state: alertStateEnum().notNull().default("scheduled"),
    recipients: jsonb().$type<string[]>().notNull().default([]),
    sentAt: timestamp({ withTimezone: true }),
    resendMessageId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** One rung per subject, ever — the dedupe that stops an eternal daily mail. */
    uniqueIndex("expiry_alert_rung_unique").on(t.subjectType, t.subjectId, t.tier),
    index("expiry_alert_due_idx").on(t.state, t.scheduledFor),
  ],
);

/** Rule-change fan-out: one row per (org, change) so a replay cannot double-send. */
export const changeAlerts = pgTable(
  "change_alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requirementChangeId: uuid()
      .notNull()
      .references(() => requirementChanges.id, { onDelete: "cascade" }),
    state: alertStateEnum().notNull().default("scheduled"),
    recipients: jsonb().$type<string[]>().notNull().default([]),
    sentAt: timestamp({ withTimezone: true }),
    resendMessageId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("change_alert_unique").on(t.organizationId, t.requirementChangeId),
    index("change_alert_due_idx").on(t.state),
  ],
);

/* ------------------------------------------------------------------ *
 * Crowdsourcing, webhooks, audit
 * ------------------------------------------------------------------ */

export const contributions = pgTable(
  "contributions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requirementRecordId: uuid()
      .notNull()
      .references(() => requirementRecords.id, { onDelete: "cascade" }),
    proposedChanges: jsonb().$type<ProposedChanges>().notNull(),
    evidence: text().notNull(),
    reviewState: contributionReviewStateEnum().notNull().default("pending"),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),
    rejectionReason: text(),
    creditCentsAwarded: integer(),
    resultingRecordId: uuid().references(() => requirementRecords.id, { onDelete: "set null" }),
    /** Reputation at submission time — the moderator sees who is talking. */
    reputationAtSubmit: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contributions_state_idx").on(t.reviewState, t.createdAt),
    index("contributions_record_idx").on(t.requirementRecordId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    providerEventId: text().notNull(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    processedAt: timestamp({ withTimezone: true }),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_event_unique").on(t.provider, t.providerEventId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid().references(() => organizations.id, { onDelete: "set null" }),
    /** "system" or a user id, as text — the row outlives the account. */
    actor: text().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    target: text().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_target_idx").on(t.target)],
);

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  jobs: many(jobs),
  licenses: many(licensesAndCredentials),
  watches: many(jurisdictionWatches),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const jurisdictionsRelations = relations(jurisdictions, ({ many }) => ({
  sources: many(jurisdictionSources),
  records: many(requirementRecords),
  watches: many(jurisdictionWatches),
}));

export const jurisdictionSourcesRelations = relations(jurisdictionSources, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [jurisdictionSources.jurisdictionId],
    references: [jurisdictions.id],
  }),
}));

export const requirementRecordsRelations = relations(requirementRecords, ({ one }) => ({
  jurisdiction: one(jurisdictions, {
    fields: [requirementRecords.jurisdictionId],
    references: [jurisdictions.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  jurisdiction: one(jurisdictions, {
    fields: [jobs.jurisdictionId],
    references: [jurisdictions.id],
  }),
  checklist: one(permitChecklists, {
    fields: [jobs.id],
    references: [permitChecklists.jobId],
  }),
  applications: many(permitApplications),
}));

export const permitChecklistsRelations = relations(permitChecklists, ({ one, many }) => ({
  job: one(jobs, { fields: [permitChecklists.jobId], references: [jobs.id] }),
  record: one(requirementRecords, {
    fields: [permitChecklists.requirementRecordId],
    references: [requirementRecords.id],
  }),
  items: many(checklistItems),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  checklist: one(permitChecklists, {
    fields: [checklistItems.checklistId],
    references: [permitChecklists.id],
  }),
}));

export const permitApplicationsRelations = relations(permitApplications, ({ one, many }) => ({
  job: one(jobs, { fields: [permitApplications.jobId], references: [jobs.id] }),
  inspections: many(inspections),
}));

export const inspectionsRelations = relations(inspections, ({ one }) => ({
  application: one(permitApplications, {
    fields: [inspections.permitApplicationId],
    references: [permitApplications.id],
  }),
}));

export const contributionsRelations = relations(contributions, ({ one }) => ({
  user: one(users, { fields: [contributions.userId], references: [users.id] }),
  record: one(requirementRecords, {
    fields: [contributions.requirementRecordId],
    references: [requirementRecords.id],
  }),
}));

/* ------------------------------------------------------------------ *
 * Enum-derived unions and jsonb payload types
 * ------------------------------------------------------------------ */

export type Plan = (typeof planEnum.enumValues)[number];
export type PlanInterval = (typeof planIntervalEnum.enumValues)[number];
export type OrgRole = (typeof orgRoleEnum.enumValues)[number];
export type CoverageStatus = (typeof coverageStatusEnum.enumValues)[number];
export type JurisdictionKind = (typeof jurisdictionKindEnum.enumValues)[number];
export type PermitExpiryBasis = (typeof permitExpiryBasisEnum.enumValues)[number];
export type SourceStatus = (typeof sourceStatusEnum.enumValues)[number];
export type SourceKind = (typeof sourceKindEnum.enumValues)[number];
export type ChangeOrigin = (typeof changeOriginEnum.enumValues)[number];
export type ReviewState = (typeof reviewStateEnum.enumValues)[number];
export type ContributionReviewState = (typeof contributionReviewStateEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type ChecklistItemKind = (typeof checklistItemKindEnum.enumValues)[number];
export type VerificationState = (typeof verificationStateEnum.enumValues)[number];
export type ApplicationStatus = (typeof applicationStatusEnum.enumValues)[number];
export type InspectionResult = (typeof inspectionResultEnum.enumValues)[number];
export type CredentialKind = (typeof credentialKindEnum.enumValues)[number];
export type ExpirySubjectType = (typeof expirySubjectTypeEnum.enumValues)[number];
export type ExpiryAlertTier = (typeof expiryAlertTierEnum.enumValues)[number];
export type AlertState = (typeof alertStateEnum.enumValues)[number];

export interface OrgSettings {
  /** Weekly digest day, 0 = Sunday. Absent means Monday. */
  digestDay?: number;
  /** Extra addresses copied on every alert (office manager, bookkeeper). */
  ccEmails?: string[];
}

export interface JurisdictionContact {
  phone?: string;
  address?: string;
  hours?: string;
  email?: string;
}

export interface FeeLine {
  label: string;
  /** Integer cents. Fees are never a float in this codebase. */
  amountCents: number;
  notes?: string;
}

export interface SubmittalRequirement {
  title: string;
  detail: string;
  required: boolean;
}

export interface StatusEvent {
  status: ApplicationStatus;
  at: string;
  by: string;
  note?: string;
}

export interface ProposedChanges {
  reviewTimeline?: string;
  quirks?: string;
  fees?: FeeLine[];
  submittalRequirements?: SubmittalRequirement[];
  permitsRequired?: string[];
  inspectionContact?: string;
  inspectionLeadTimeDays?: number;
  reinspectionFeeCents?: number;
}

/* Row types, inferred so callers never restate a column list. */
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type JurisdictionSource = typeof jurisdictionSources.$inferSelect;
export type RequirementRecord = typeof requirementRecords.$inferSelect;
export type RequirementChange = typeof requirementChanges.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type PermitChecklist = typeof permitChecklists.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type PermitApplication = typeof permitApplications.$inferSelect;
export type Inspection = typeof inspections.$inferSelect;
export type Credential = typeof licensesAndCredentials.$inferSelect;
export type ExpiryAlert = typeof expiryAlerts.$inferSelect;
export type ChangeAlert = typeof changeAlerts.$inferSelect;
export type Contribution = typeof contributions.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
