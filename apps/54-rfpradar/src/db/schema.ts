/**
 * src/db/schema.ts
 *
 * Drizzle schema for RFPRadar — the complete data model from
 * ARCHITECTURE.md. Multi-tenant: everything hangs off firms.id EXCEPT
 * `sources` and `opportunities`, which are shared public data fetched
 * once for all firms.
 *
 * This schema is the spine of the build: implement it first, run
 * `npm run db:generate && npm run db:migrate`, and keep every column
 * in sync with ARCHITECTURE.md's Data Model section.
 */

import {
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

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Tenant root. */
export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "scout", "pursuit", "capture"] }).notNull().default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  slackWebhookUrl: text("slack_webhook_url"),
  icsTokenHash: text("ics_token_hash"),
  /** jsonb: { scanHour: number, scoreThreshold: number } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

/** Seats. Auth.js adapter tables live alongside (see lib/auth.ts). */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** What the firm hunts. */
export const keywordProfiles = pgTable("keyword_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id").notNull().references(() => firms.id),
  name: text("name").notNull(),
  naicsCodes: text("naics_codes").array().notNull().default([]),
  pscCodes: text("psc_codes").array().notNull().default([]),
  keywords: text("keywords").array().notNull().default([]),
  negativeKeywords: text("negative_keywords").array().notNull().default([]),
  states: text("states").array().notNull().default([]),
  agencies: text("agencies").array().notNull().default([]),
  /** jsonb: { minCents?: number, maxCents?: number } */
  valueBand: jsonb("value_band"),
  status: text("status", { enum: ["active", "paused"] }).notNull().default("active"),
  ...timestamps,
});

/** Shared feed registry (NOT firm-scoped). */
export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["api", "rss", "csv", "html"] }).notNull(),
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(240),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  status: text("status", { enum: ["ok", "degraded", "down"] }).notNull().default("ok"),
  statusNote: text("status_note"),
  /** jsonb: { urls: string[], parserHints?: Record<string, string> } */
  config: jsonb("config").notNull().default({}),
  ...timestamps,
});

/** The shared normalized store (NOT firm-scoped). */
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id").notNull().references(() => sources.id),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    agency: text("agency").notNull(),
    state: text("state"),
    naicsCodes: text("naics_codes").array().notNull().default([]),
    pscCodes: text("psc_codes").array().notNull().default([]),
    /** tsvector index added in a hand-written migration; see BUILD.md. */
    description: text("description").notNull().default(""),
    url: text("url").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    questionsDueAt: timestamp("questions_due_at", { withTimezone: true }),
    responsesDueAt: timestamp("responses_due_at", { withTimezone: true }),
    /** jsonb: { minCents?: number, maxCents?: number } */
    estValueBand: jsonb("est_value_band"),
    oppStatus: text("opp_status", { enum: ["open", "amended", "cancelled", "closed"] })
      .notNull()
      .default("open"),
    raw: jsonb("raw").notNull().default({}),
    contentHash: text("content_hash").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("opportunities_source_external_idx").on(t.sourceId, t.externalId),
    index("opportunities_responses_due_idx").on(t.responsesDueAt),
  ],
);

/** Change trail per notice (amendments, date changes, cancellations). */
export const opportunityEvents = pgTable("opportunity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
  kind: text("kind", { enum: ["posted", "amended", "date_changed", "cancelled"] }).notNull(),
  /** jsonb: { field?: string, old?: string, new?: string } */
  detail: jsonb("detail").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Profile x opportunity. Score never shown without factors. */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    keywordProfileId: uuid("keyword_profile_id").notNull().references(() => keywordProfiles.id),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id),
    score: integer("score").notNull(),
    /** jsonb: [{ key, weight, matched, reason }] — rendered verbatim in the UI. */
    factors: jsonb("factors").notNull().default([]),
    state: text("state", {
      enum: ["new", "seen", "dismissed", "pursued", "suppressed"],
    })
      .notNull()
      .default("new"),
    dismissReason: text("dismiss_reason"),
    scoredAt: timestamp("scored_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("matches_profile_opportunity_idx").on(t.keywordProfileId, t.opportunityId),
    index("matches_firm_state_idx").on(t.firmId, t.state),
  ],
);

/** The workspace object. opportunityId nullable: manual/enterprise RFPs allowed. */
export const pursuits = pgTable("pursuits", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id").notNull().references(() => firms.id),
  opportunityId: uuid("opportunity_id").references(() => opportunities.id),
  title: text("title").notNull(),
  stage: text("stage", {
    enum: ["watching", "go_no_go", "drafting", "submitted", "won", "lost", "no_bid"],
  })
    .notNull()
    .default("watching"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  valueCents: integer("value_cents"),
  outcomeNote: text("outcome_note"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  ...timestamps,
});

/** Go/no-go record. The recorded "no" is a first-class outcome. */
export const scorecards = pgTable("scorecards", {
  id: uuid("id").primaryKey().defaultRandom(),
  pursuitId: uuid("pursuit_id").notNull().unique().references(() => pursuits.id),
  /** jsonb: [{ key, label, weight, score1to5, note }] */
  criteria: jsonb("criteria").notNull().default([]),
  verdict: text("verdict", { enum: ["go", "no_go", "conditional"] }),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps,
});

/** Every date the firm must not miss. */
export const deadlines = pgTable(
  "deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id").notNull().references(() => firms.id),
    pursuitId: uuid("pursuit_id").references(() => pursuits.id),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id),
    kind: text("kind", { enum: ["questions", "proposal", "orals", "custom"] }).notNull(),
    label: text("label").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("deadlines_firm_due_idx").on(t.firmId, t.dueAt)],
);

/** Exactly-once reminder ledger (T-7/3/1). */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deadlineId: uuid("deadline_id").notNull().references(() => deadlines.id),
    offsetDays: integer("offset_days").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminders_deadline_offset_idx").on(t.deadlineId, t.offsetDays)],
);

/** The answer library. Edits never rewrite submitted history (see blockUses). */
export const answerBlocks = pgTable("answer_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id").notNull().references(() => firms.id),
  kind: text("kind", {
    enum: ["boilerplate", "past_answer", "bio", "past_performance", "attachment_ref"],
  }).notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: text("tags").array().notNull().default([]),
  version: integer("version").notNull().default(1),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  stale: boolean("stale").notNull().default(false),
  wonWith: boolean("won_with").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

/** Link-and-snapshot: the pursuit's content is frozen at link time. */
export const blockUses = pgTable("block_uses", {
  id: uuid("id").primaryKey().defaultRandom(),
  pursuitId: uuid("pursuit_id").notNull().references(() => pursuits.id),
  answerBlockId: uuid("answer_block_id").notNull().references(() => answerBlocks.id),
  snapshotBody: text("snapshot_body").notNull(),
  snapshotVersion: integer("snapshot_version").notNull(),
  requirementLabel: text("requirement_label").notNull(),
  linkedByUserId: uuid("linked_by_user_id").references(() => users.id),
  ...timestamps,
});

/** Per-pursuit checklist. */
export const requirements = pgTable("requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  pursuitId: uuid("pursuit_id").notNull().references(() => pursuits.id),
  label: text("label").notNull(),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: text("status", { enum: ["todo", "drafting", "done"] }).notNull().default("todo"),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** Per-recipient send outcome (morning scans, reminders, alerts). */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id").notNull().references(() => firms.id),
  userId: uuid("user_id").references(() => users.id),
  channel: text("channel", { enum: ["email", "slack"] }).notNull(),
  kind: text("kind", {
    enum: ["morning_scan", "deadline", "match", "pursuit_event"],
  }).notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status", { enum: ["queued", "sent", "failed"] }).notNull().default("queued"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stripe idempotency ledger: insert by event id before any processing. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("stripe"),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_external_idx").on(t.externalId)],
);

/** Scorecard decisions, library edits, token rotations, seat changes. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id").notNull().references(() => firms.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
