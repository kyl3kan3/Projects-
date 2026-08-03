/**
 * Drizzle ORM schema — the data model from ARCHITECTURE.md, one table per bullet.
 * Migrations are generated from this file (`npm run db:generate`).
 *
 * Conventions worth knowing before reading:
 *
 *  - **Money is integer cents.** Never a float, never a `numeric` the driver hands
 *    back as a string. A total here ends up on a tax return.
 *  - **Confidence is basis points** (`integer`, 0–10 000) wherever it is compared
 *    or sorted, and a plain 0–1 number only inside the `confidence` jsonb the UI
 *    prints. A threshold comparison against a float column is a coin toss at the
 *    boundary; against an integer it is not.
 *  - **Receipt dates are `date`, not `timestamptz`.** They are calendar dates, and
 *    storing them as instants files a receipt dated the 1st into the wrong month
 *    for anyone west of UTC.
 *  - **Tenancy is `organization_id` on every domain table**, including tables that
 *    could reach it through a join. A query that needs three joins to learn whose
 *    row it is will eventually be written without them.
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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ enums --- */

export const planEnum = pgEnum("plan", ["solo", "operator", "pro"]);
export const orgRoleEnum = pgEnum("org_role", ["owner", "member"]);
export const documentSourceEnum = pgEnum("document_source", ["email", "photo", "upload"]);
/**
 * `queued` covers both "waiting for the sweep" and "parked over the plan cap" —
 * which of the two it is is derived from the period's usage counter at read time
 * rather than stored, because a stored answer goes stale the moment the operator
 * upgrades.
 */
export const documentStatusEnum = pgEnum("document_status", [
  "queued",
  "extracting",
  "needs_review",
  "confirmed",
  "rejected",
  "duplicate",
]);
export const docTypeEnum = pgEnum("doc_type", ["receipt", "invoice", "statement", "other"]);
export const reviewFieldEnum = pgEnum("review_field", [
  "vendor",
  "date",
  "total",
  "tax",
  "category",
]);
export const reviewResolutionEnum = pgEnum("review_resolution", [
  "accepted",
  "corrected",
  "skipped",
]);
export const closeStatusEnum = pgEnum("close_status", ["open", "closing", "closed"]);
export const ruleSourceEnum = pgEnum("rule_source", ["correction", "manual"]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "weekly_digest",
  "review_nudge",
  "close_ready",
  "over_cap",
]);

export type Plan = (typeof planEnum.enumValues)[number];
export type OrgRole = (typeof orgRoleEnum.enumValues)[number];
export type DocumentSource = (typeof documentSourceEnum.enumValues)[number];
export type DocumentStatus = (typeof documentStatusEnum.enumValues)[number];
export type DocType = (typeof docTypeEnum.enumValues)[number];
export type ReviewField = (typeof reviewFieldEnum.enumValues)[number];
export type ReviewResolution = (typeof reviewResolutionEnum.enumValues)[number];
export type ClosePeriodStatus = (typeof closeStatusEnum.enumValues)[number];
export type RuleSource = (typeof ruleSourceEnum.enumValues)[number];
export type NotificationKind = (typeof notificationKindEnum.enumValues)[number];

/** Per-field confidence as the extractor reported it, 0–1, for display only. */
export type FieldConfidence = Partial<Record<ReviewField, number>>;

/* ---------------------------------------------------------- organizations --- */

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    plan: planEnum("plan").notNull().default("solo"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Builds the forwarding address `docs+{slug}@in.ledgerlens.app`. */
    forwardingSlug: text("forwarding_slug").notNull(),
    /** IANA zone. Decides which calendar month a photo taken at 11pm belongs to. */
    timeZone: text("time_zone").notNull().default("America/Denver"),
    fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1),
    /** 0 = Sunday … 6 = Saturday. The weekly digest goes out on this weekday. */
    digestWeekday: integer("digest_weekday").notNull().default(1),
    weeklyDigestEnabled: boolean("weekly_digest_enabled").notNull().default(true),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /** Labelled sample org used for the marketing artifact. Never billed. */
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organizations_forwarding_slug_key").on(t.forwardingSlug)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: orgRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    index("users_organization_idx").on(t.organizationId),
  ],
);

/* ------------------------------------------------------------- categories --- */

/**
 * The Schedule-C-aligned set. `organization_id` null means the global seed every
 * org reads; a non-null row would be an org's own category (post-MVP). Two partial
 * unique indexes rather than one, because `unique(organization_id, slug)` does not
 * constrain the global rows at all — in Postgres every NULL is distinct.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** The line on IRS Schedule C this maps to, e.g. "22" or "24b". */
    scheduleCLine: text("schedule_c_line").notNull(),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("categories_global_slug_key")
      .on(t.slug)
      .where(sql`organization_id is null`),
    uniqueIndex("categories_org_slug_key")
      .on(t.organizationId, t.slug)
      .where(sql`organization_id is not null`),
  ],
);

/* ---------------------------------------------------------------- vendors --- */

export const vendors = pgTable(
  "vendors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    /** `normalizeVendor()` output — "HOME DEPOT #1234" and "Home Depot" collapse. */
    normalizedName: text("normalized_name").notNull(),
    /** The learned rule: "Home Depot is always Supplies". */
    defaultCategoryId: uuid("default_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    ruleSource: ruleSourceEnum("rule_source"),
    documentCount: integer("document_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vendors_org_normalized_key").on(t.organizationId, t.normalizedName)],
);

/* -------------------------------------------------------------- documents --- */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: documentSourceEnum("source").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    /** sha256 of the bytes. Exact-duplicate detection, and the storage key. */
    contentHash: text("content_hash").notNull(),
    originalFilename: text("original_filename").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    /** Set for email-sourced documents; makes a webhook replay a no-op. */
    emailMessageId: text("email_message_id"),
    /** Text the source carried (email body, PDF text layer) — extraction input. */
    sourceText: text("source_text"),
    status: documentStatusEnum("status").notNull().default("queued"),
    /** Set when this is byte-identical to an existing document. */
    duplicateOfId: uuid("duplicate_of_id").references((): AnyPgColumn => documents.id, {
      onDelete: "set null",
    }),
    /** Same vendor + total within a 3-day window: a *candidate*, pending merge. */
    duplicateCandidateOfId: uuid("duplicate_candidate_of_id").references(
      (): AnyPgColumn => documents.id,
      { onDelete: "set null" },
    ),
    /** Why extraction gave up: "unreadable" | "not_financial" | "extractor_error". */
    failureReason: text("failure_reason"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    extractingSince: timestamp("extracting_since", { withTimezone: true }),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial, because a duplicate *is* stored — as a visible duplicate record with
    // the same hash — and a plain unique index would refuse the second forward
    // instead of recording it.
    uniqueIndex("documents_org_hash_key")
      .on(t.organizationId, t.contentHash)
      .where(sql`duplicate_of_id is null`),
    index("documents_org_status_idx").on(t.organizationId, t.status),
    index("documents_org_received_idx").on(t.organizationId, t.receivedAt),
    index("documents_email_message_idx").on(t.organizationId, t.emailMessageId),
  ],
);

/* ------------------------------------------------------------ extractions --- */

export const extractions = pgTable(
  "extractions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** "anthropic" or "deterministic" — which implementation produced this. */
    extractor: text("extractor").notNull(),
    model: text("model").notNull(),
    attempt: integer("attempt").notNull().default(1),
    escalated: boolean("escalated").notNull().default(false),
    rawResponse: jsonb("raw_response").$type<unknown>(),
    vendorName: text("vendor_name"),
    docType: docTypeEnum("doc_type"),
    docDate: date("doc_date"),
    totalCents: integer("total_cents"),
    taxCents: integer("tax_cents"),
    currency: text("currency").notNull().default("USD"),
    lineSummary: text("line_summary"),
    suggestedCategorySlug: text("suggested_category_slug"),
    confidence: jsonb("confidence").$type<FieldConfidence>().notNull().default({}),
    overallConfidenceBp: integer("overall_confidence_bp").notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    costMicrocents: integer("cost_microcents").notNull().default(0),
    /** Set when the run failed: "parse_failed" | "refused" | "timeout" | "error". */
    failure: text("failure"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("extractions_document_idx").on(t.documentId),
    index("extractions_org_created_idx").on(t.organizationId, t.createdAt),
  ],
);

/* ------------------------------------------------------------- line items --- */

/**
 * The reviewed truth the exports read from. One row per document.
 *
 * `confirmed_at` null means *draft* — auto-populated from high-confidence fields
 * but not yet vouched for. The export layer filters on `confirmed_at is not null`,
 * which is the single gate that keeps an unreviewed guess out of a tax export.
 */
export const lineItems = pgTable(
  "line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    docDate: date("doc_date").notNull(),
    amountCents: integer("amount_cents").notNull(),
    taxCents: integer("tax_cents"),
    currency: text("currency").notNull().default("USD"),
    memo: text("memo"),
    /** "system" for an auto-confirm, otherwise the user id that ruled it off. */
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("line_items_document_key").on(t.documentId),
    index("line_items_org_date_idx").on(t.organizationId, t.docDate),
    index("line_items_org_confirmed_idx").on(t.organizationId, t.confirmedAt),
  ],
);

/* ----------------------------------------------------------- review items --- */

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    field: reviewFieldEnum("field").notNull(),
    suggestedValue: text("suggested_value"),
    confidenceBp: integer("confidence_bp").notNull().default(0),
    resolvedValue: text("resolved_value"),
    resolution: reviewResolutionEnum("resolution"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("review_items_document_field_key").on(t.documentId, t.field),
    index("review_items_org_open_idx").on(t.organizationId, t.resolvedAt),
  ],
);

/* ---------------------------------------------------------- close periods --- */

export interface CategoryTotal {
  slug: string;
  name: string;
  scheduleCLine: string;
  amountCents: number;
  documentCount: number;
}

export interface MissingReceiptGap {
  vendor: string;
  /** Periods in the trailing window this vendor did appear in. */
  seenInPeriods: string[];
  typicalAmountCents: number;
}

export interface FlaggedEntry {
  documentId: string;
  vendor: string;
  amountCents: number;
  reason: string;
}

export interface PeriodSummary {
  period: string;
  version: number;
  generatedAt: string;
  documentCount: number;
  confirmedCount: number;
  /** Unreviewed documents named in the package because the close was forced. */
  unreviewedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  totalCents: number;
  taxCents: number;
  previousTotalCents: number | null;
  totalsByCategory: CategoryTotal[];
  flagged: FlaggedEntry[];
  missingReceipts: MissingReceiptGap[];
  currency: string;
}

export const closePeriods = pgTable(
  "close_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // YYYY-MM
    status: closeStatusEnum("status").notNull().default("open"),
    summary: jsonb("summary").$type<PeriodSummary>(),
    pdfStorageKey: text("pdf_storage_key"),
    packageStorageKey: text("package_storage_key"),
    /** Closed with unresolved review items, explicitly marked in the summary. */
    forced: boolean("forced").notNull().default(false),
    version: integer("version").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("close_periods_org_period_key").on(t.organizationId, t.period)],
);

/* ------------------------------------------------------------ share links --- */

export const shareLinks = pgTable(
  "share_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Null = every closed period. */
    closePeriodId: uuid("close_period_id").references(() => closePeriods.id, {
      onDelete: "cascade",
    }),
    label: text("label").notNull(),
    /** Only the hash is stored; the token exists once, in the copied URL. */
    tokenHash: text("token_hash").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
    accessCount: integer("access_count").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("share_links_token_key").on(t.tokenHash),
    index("share_links_org_idx").on(t.organizationId),
  ],
);

/* --------------------------------------------------------- usage counters --- */

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    period: text("period").notNull(), // YYYY-MM
    documentsIngested: integer("documents_ingested").notNull().default(0),
    documentsExtracted: integer("documents_extracted").notNull().default(0),
    // bigint, not integer: a microcent is a millionth of a cent, so a Pro org's
    // thousand documents can sum past int4 in a busy month.
    extractionCostMicrocents: bigint("extraction_cost_microcents", { mode: "number" })
      .notNull()
      .default(0),
    reportedToStripeAt: timestamp("reported_to_stripe_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usage_counters_org_period_key").on(t.organizationId, t.period)],
);

/* ------------------------------------------------------------ audit trail --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "system", a user id, or "share:{shareLinkId}". */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_created_idx").on(t.organizationId, t.createdAt)],
);

/* ---------------------------------------------------------- notifications --- */

/**
 * One row per notification actually sent, with a unique key.
 *
 * This table is the reason a nudge cannot loop. Every notice is pinned to a fixed
 * key — an ISO week for the digest, `{period}:d{n}` for a close nudge — so a
 * condition that stays true forever (a period with an unresolved item) still only
 * produces the notices on its ladder, once each, and then goes quiet.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    key: text("key").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_org_kind_key").on(t.organizationId, t.kind, t.key)],
);

/* --------------------------------------------------------- webhook events --- */

/** Stripe replays. The primary key makes the second delivery a no-op. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- relations --- */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  documents: many(documents),
  vendors: many(vendors),
  lineItems: many(lineItems),
  closePeriods: many(closePeriods),
  shareLinks: many(shareLinks),
}));

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documents.organizationId],
    references: [organizations.id],
  }),
  extractions: many(extractions),
  reviewItems: many(reviewItems),
  lineItem: one(lineItems, { fields: [documents.id], references: [lineItems.documentId] }),
}));

export const extractionsRelations = relations(extractions, ({ one }) => ({
  document: one(documents, { fields: [extractions.documentId], references: [documents.id] }),
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  document: one(documents, { fields: [lineItems.documentId], references: [documents.id] }),
  vendor: one(vendors, { fields: [lineItems.vendorId], references: [vendors.id] }),
  category: one(categories, { fields: [lineItems.categoryId], references: [categories.id] }),
}));

export const reviewItemsRelations = relations(reviewItems, ({ one }) => ({
  document: one(documents, { fields: [reviewItems.documentId], references: [documents.id] }),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [vendors.organizationId],
    references: [organizations.id],
  }),
  defaultCategory: one(categories, {
    fields: [vendors.defaultCategoryId],
    references: [categories.id],
  }),
  lineItems: many(lineItems),
}));

export const closePeriodsRelations = relations(closePeriods, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [closePeriods.organizationId],
    references: [organizations.id],
  }),
  shareLinks: many(shareLinks),
}));

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  organization: one(organizations, {
    fields: [shareLinks.organizationId],
    references: [organizations.id],
  }),
  closePeriod: one(closePeriods, {
    fields: [shareLinks.closePeriodId],
    references: [closePeriods.id],
  }),
}));

/* ----------------------------------------------------------------- types --- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Extraction = typeof extractions.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type ReviewItem = typeof reviewItems.$inferSelect;
export type ClosePeriod = typeof closePeriods.$inferSelect;
export type ShareLink = typeof shareLinks.$inferSelect;
export type UsageCounter = typeof usageCounters.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
