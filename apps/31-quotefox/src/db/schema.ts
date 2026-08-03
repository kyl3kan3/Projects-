/**
 * Drizzle schema — the data model in ARCHITECTURE.md, one table per entity.
 *
 * Two conventions run through all of it:
 *
 *  - **Money is integer cents, quantities are integer thousandths.** Nothing in
 *    this file is a float. A quantity of 2.5 hours is stored as 2500; a unit
 *    price of $170.00 as 17000. Rounding happens once, at the edge
 *    (src/lib/money.ts), never repeatedly down a chain of multiplications.
 *  - **Every domain row carries `organization_id`**, even when it could reach one
 *    through a parent. A tenancy filter that needs a join is a tenancy filter
 *    someone will forget to write.
 *
 * One deliberate departure from ARCHITECTURE.md: `price_book_items` has no
 * pgvector `embedding` column. Candidate retrieval for drafting is lexical and
 * trade-aware (src/lib/matching.ts) rather than embedding-based — see the note
 * at the top of that file. The column can be added later without touching
 * anything else, because retrieval sits behind one function.
 */

import { relations } from "drizzle-orm";
import {
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

/* --------------------------------------------------------------- enums ---- */

export const planEnum = pgEnum("plan", ["solo", "crew", "fleet"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "trial_expired",
]);
export const tradeEnum = pgEnum("trade", ["hvac", "roofing", "electrical", "plumbing", "other"]);
export const roleEnum = pgEnum("role", ["owner", "estimator", "tech"]);
export const itemKindEnum = pgEnum("item_kind", ["labor", "material", "flat_rate"]);
export const unitEnum = pgEnum("unit", ["each", "hour", "sqft", "lf", "day"]);
export const itemSourceEnum = pgEnum("item_source", ["manual", "csv_import", "template"]);
export const jobStatusEnum = pgEnum("job_status", ["open", "quoted", "won", "lost"]);
export const walkthroughStatusEnum = pgEnum("walkthrough_status", [
  "capturing",
  "uploaded",
  "transcribing",
  "drafting",
  "drafted",
  "failed",
]);
export const mediaKindEnum = pgEnum("media_kind", ["audio", "photo"]);
export const uploadStatusEnum = pgEnum("upload_status", ["pending", "complete", "failed"]);
export const estimateStatusEnum = pgEnum("estimate_status", ["drafting", "draft", "ready", "sent"]);
export const lineItemSourceEnum = pgEnum("line_item_source", ["ai", "manual"]);
export const depositTypeEnum = pgEnum("deposit_type", ["none", "percent", "fixed"]);
export const proposalStatusEnum = pgEnum("proposal_status", [
  "sent",
  "viewed",
  "accepted",
  "deposit_paid",
  "expired",
  "withdrawn",
]);
export const proposalEventEnum = pgEnum("proposal_event_type", [
  "sent",
  "delivered",
  "viewed",
  "accepted",
  "deposit_initiated",
  "deposit_paid",
  "deposit_refunded",
  "nudge_sent",
  "expired",
  "withdrawn",
]);
export const depositStatusEnum = pgEnum("deposit_status", ["pending", "paid", "refunded", "failed"]);
export const transcriptSourceEnum = pgEnum("transcript_source", ["whisper", "demo_fixture"]);

/* -------------------------------------------------------- organizations ---- */

export const organizations = pgTable("organizations", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  trade: tradeEnum().notNull().default("hvac"),
  plan: planEnum().notNull().default("solo"),
  subscriptionStatus: subscriptionStatusEnum().notNull().default("trialing"),
  trialEndsAt: timestamp({ withTimezone: true }),
  billingStripeCustomerId: text(),
  billingStripeSubscriptionId: text(),
  /** The contractor's own connected account — deposits land there, not with us. */
  stripeConnectAccountId: text(),
  stripeConnectReady: boolean().notNull().default(false),
  /** Branding: license number, colour, logo key. Empty until onboarding runs. */
  licenseNumber: text(),
  insuranceLine: text(),
  brandColor: text().notNull().default("#CD7A29"),
  logoKey: text(),
  phone: text(),
  address: text(),
  /** Estimate defaults. Markup is whole percent; tax is basis points. */
  defaultMarkupPct: integer().notNull().default(35),
  taxRateBp: integer().notNull().default(0),
  defaultDepositType: depositTypeEnum().notNull().default("percent"),
  defaultDepositValue: integer().notNull().default(10),
  termsText: text(),
  onboardedAt: timestamp({ withTimezone: true }),
  /** Metering: AI drafts used in the current billing period. */
  quoteCountCurrentPeriod: integer().notNull().default(0),
  periodStartedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
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
    role: roleEnum().notNull().default("owner"),
    passwordHash: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email), index("users_org_idx").on(t.organizationId)],
);

/* ---------------------------------------------------------- price book ---- */

export const priceBookItems = pgTable(
  "price_book_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    category: text().notNull(),
    name: text().notNull(),
    description: text(),
    kind: itemKindEnum().notNull().default("material"),
    unit: unitEnum().notNull().default("each"),
    unitCostCents: integer().notNull(),
    /** Null means "use the org default markup". Whole percent. */
    markupPct: integer(),
    /** Lowercased name + description + category, used by lexical retrieval. */
    searchText: text().notNull().default(""),
    active: boolean().notNull().default(true),
    source: itemSourceEnum().notNull().default("manual"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pbi_org_active_idx").on(t.organizationId, t.active),
    // Dedupe key for CSV import and template seeding.
    uniqueIndex("pbi_org_category_name_key").on(t.organizationId, t.category, t.name),
  ],
);

/* ---------------------------------------------------------------- jobs ---- */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerName: text().notNull(),
    customerEmail: text(),
    customerPhone: text(),
    address: text().notNull(),
    /** Two-letter state, when we can read one out of the address. Deposit caps. */
    stateCode: text(),
    trade: tradeEnum().notNull().default("hvac"),
    title: text().notNull(),
    status: jobStatusEnum().notNull().default("open"),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_org_status_idx").on(t.organizationId, t.status, t.createdAt)],
);

/* -------------------------------------------------------- walkthroughs ---- */

export const walkthroughs = pgTable(
  "walkthroughs",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    recordedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    status: walkthroughStatusEnum().notNull().default("capturing"),
    durationSeconds: integer().notNull().default(0),
    /** Typed notes from the driveway. Always part of the drafting input. */
    notes: text(),
    transcript: text(),
    transcriptSource: transcriptSourceEnum(),
    /** 0–100. Below ~55 the pipeline refuses to draft. */
    transcriptConfidence: integer(),
    failureReason: text(),
    audioSeconds: integer().notNull().default(0),
    startedProcessingAt: timestamp({ withTimezone: true }),
    draftedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wt_job_idx").on(t.jobId, t.createdAt)],
);

export const walkthroughMedia = pgTable(
  "walkthrough_media",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    walkthroughId: uuid()
      .notNull()
      .references(() => walkthroughs.id, { onDelete: "cascade" }),
    kind: mediaKindEnum().notNull(),
    storageKey: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull().default(0),
    sequence: integer().notNull().default(0),
    caption: text(),
    uploadStatus: uploadStatusEnum().notNull().default("pending"),
    uploadAttempts: integer().notNull().default(0),
    capturedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wm_walkthrough_idx").on(t.walkthroughId, t.kind, t.sequence),
    uniqueIndex("wm_key_key").on(t.storageKey),
  ],
);

/* ----------------------------------------------------------- estimates ---- */

export const estimates = pgTable(
  "estimates",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    walkthroughId: uuid().references(() => walkthroughs.id, { onDelete: "set null" }),
    version: integer().notNull().default(1),
    status: estimateStatusEnum().notNull().default("draft"),
    scopeSummary: text(),
    subtotalCents: integer().notNull().default(0),
    taxCents: integer().notNull().default(0),
    totalCents: integer().notNull().default(0),
    taxRateBp: integer().notNull().default(0),
    depositType: depositTypeEnum().notNull().default("none"),
    depositValue: integer().notNull().default(0),
    draftedByModel: text(),
    promptVersion: text(),
    draftDurationMs: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("est_job_version_key").on(t.jobId, t.version),
    index("est_org_status_idx").on(t.organizationId, t.status, t.updatedAt),
  ],
);

export const estimateLineItems = pgTable(
  "estimate_line_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    estimateId: uuid()
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    position: integer().notNull().default(0),
    /** Null = the model could not match this to the price book: needs pricing. */
    priceBookItemId: uuid().references(() => priceBookItems.id, { onDelete: "set null" }),
    name: text().notNull(),
    description: text(),
    /** Quantity × 1000, so 2.5 hours is 2500. Never a float. */
    quantityMilli: integer().notNull().default(1000),
    unit: unitEnum().notNull().default("each"),
    unitPriceCents: integer().notNull().default(0),
    lineTotalCents: integer().notNull().default(0),
    needsPricing: boolean().notNull().default(false),
    source: lineItemSourceEnum().notNull().default("manual"),
    /** The narration that produced this row — the audit trail on every line. */
    transcriptExcerpt: text(),
    transcriptOffsetSeconds: integer(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eli_estimate_position_idx").on(t.estimateId, t.position)],
);

/* ----------------------------------------------------------- proposals ---- */

export const proposals = pgTable(
  "proposals",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobId: uuid()
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    estimateId: uuid()
      .notNull()
      .references(() => estimates.id, { onDelete: "cascade" }),
    /** jti of the signed link. Rotating it invalidates the old URL. */
    tokenId: text().notNull(),
    status: proposalStatusEnum().notNull().default("sent"),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    firstViewedAt: timestamp({ withTimezone: true }),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedByName: text(),
    acceptanceIp: text(),
    /** Frozen at send: a proposal is the artifact, the estimate stays editable. */
    totalCents: integer().notNull().default(0),
    depositCents: integer().notNull().default(0),
    scopeSummary: text(),
    termsText: text(),
    pdfKey: text(),
    withdrawnAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prop_token_key").on(t.tokenId),
    index("prop_org_status_idx").on(t.organizationId, t.status, t.sentAt),
  ],
);

export const proposalEvents = pgTable(
  "proposal_events",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    proposalId: uuid()
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    type: proposalEventEnum().notNull(),
    metadata: jsonb(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pe_proposal_idx").on(t.proposalId, t.occurredAt)],
);

/**
 * Follow-up nudges, one row per rung.
 *
 * The unique index is what stops the classic failure: a sweep that re-reads
 * "sent 6 days ago, still unviewed" every day and mails the homeowner every day
 * forever. Rungs are pinned to fixed distances from `sent_at` (+2d, +5d) and each
 * can only be written once per proposal — and a rung skipped because a later one
 * came due is recorded as skipped, so it can never fire late either.
 */
export const proposalNudges = pgTable(
  "proposal_nudges",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    proposalId: uuid()
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    /** Days after send: 2 or 5. */
    rung: integer().notNull(),
    sentAt: timestamp({ withTimezone: true }),
    skippedReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pn_proposal_rung_key").on(t.proposalId, t.rung)],
);

/* ------------------------------------------------------------ deposits ---- */

export const deposits = pgTable(
  "deposits",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    proposalId: uuid()
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    stripeCheckoutSessionId: text(),
    stripePaymentIntentId: text(),
    /** The connected account the money landed on — never ours. */
    stripeAccountId: text(),
    amountCents: integer().notNull(),
    currency: text().notNull().default("usd"),
    status: depositStatusEnum().notNull().default("pending"),
    paidAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dep_proposal_idx").on(t.proposalId),
    // One deposit row per checkout session, whatever Stripe retries.
    uniqueIndex("dep_session_key").on(t.stripeCheckoutSessionId),
  ],
);

/* ------------------------------------------------------------- plumbing ---- */

/** Raw Stripe event ids. The primary key is the idempotency guarantee. */
export const webhookEvents = pgTable("webhook_events", {
  id: text().primaryKey(),
  source: text().notNull().default("stripe"),
  type: text().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp({ withTimezone: true }),
  error: text(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    organizationId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "system", "ai", or a user id. */
    actor: text().notNull(),
    action: text().notNull(),
    target: text().notNull(),
    metadata: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_org_idx").on(t.organizationId, t.createdAt)],
);

/* ---------------------------------------------------------- relations ---- */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  priceBookItems: many(priceBookItems),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [jobs.organizationId],
    references: [organizations.id],
  }),
  walkthroughs: many(walkthroughs),
  estimates: many(estimates),
}));

export const estimatesRelations = relations(estimates, ({ one, many }) => ({
  job: one(jobs, { fields: [estimates.jobId], references: [jobs.id] }),
  walkthrough: one(walkthroughs, {
    fields: [estimates.walkthroughId],
    references: [walkthroughs.id],
  }),
  lineItems: many(estimateLineItems),
}));

export const proposalsRelations = relations(proposals, ({ one, many }) => ({
  estimate: one(estimates, { fields: [proposals.estimateId], references: [estimates.id] }),
  job: one(jobs, { fields: [proposals.jobId], references: [jobs.id] }),
  events: many(proposalEvents),
  deposits: many(deposits),
}));

/* -------------------------------------------------------------- types ---- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type PriceBookItem = typeof priceBookItems.$inferSelect;
export type NewPriceBookItem = typeof priceBookItems.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type Walkthrough = typeof walkthroughs.$inferSelect;
export type WalkthroughMedia = typeof walkthroughMedia.$inferSelect;
export type Estimate = typeof estimates.$inferSelect;
export type EstimateLineItem = typeof estimateLineItems.$inferSelect;
export type NewEstimateLineItem = typeof estimateLineItems.$inferInsert;
export type Proposal = typeof proposals.$inferSelect;
export type ProposalEvent = typeof proposalEvents.$inferSelect;
export type ProposalNudge = typeof proposalNudges.$inferSelect;
export type Deposit = typeof deposits.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;

export type Plan = (typeof planEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type Trade = (typeof tradeEnum.enumValues)[number];
export type Role = (typeof roleEnum.enumValues)[number];
export type PriceBookItemKind = (typeof itemKindEnum.enumValues)[number];
export type Unit = (typeof unitEnum.enumValues)[number];
export type ItemSource = (typeof itemSourceEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type WalkthroughStatus = (typeof walkthroughStatusEnum.enumValues)[number];
export type MediaKind = (typeof mediaKindEnum.enumValues)[number];
export type UploadStatus = (typeof uploadStatusEnum.enumValues)[number];
export type EstimateStatus = (typeof estimateStatusEnum.enumValues)[number];
export type LineItemSource = (typeof lineItemSourceEnum.enumValues)[number];
export type DepositType = (typeof depositTypeEnum.enumValues)[number];
export type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number];
export type ProposalEventType = (typeof proposalEventEnum.enumValues)[number];
export type DepositStatus = (typeof depositStatusEnum.enumValues)[number];
export type TranscriptSource = (typeof transcriptSourceEnum.enumValues)[number];

/** A drafted row before it is written: either a real item, or needs pricing. */
export interface DraftedLineItem {
  priceBookItemId: string | null;
  name: string;
  description?: string | null;
  quantityMilli: number;
  unit: Unit;
  unitPriceCents: number;
  needsPricing: boolean;
  transcriptExcerpt: string;
  transcriptOffsetSeconds: number | null;
}
