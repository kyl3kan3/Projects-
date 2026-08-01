/**
 * Drizzle ORM schema — the data model from ARCHITECTURE.md ("Data Model").
 *
 * Two families:
 *   - tenant data, always carrying `organization_id`
 *   - the shared curated funder database (`funders`, `funder_awards`,
 *     `funder_change_reports`), which never carries a tenant key
 *
 * Two conventions worth stating, because both are load-bearing:
 *
 * 1. **Deadlines are calendar dates, not instants.** `deadlines.due_on` is a
 *    Postgres `date` read as a `YYYY-MM-DD` string, and every comparison against
 *    it happens in the organization's own timezone (`organizations.timezone`).
 *    A grant report is due "on 15 September" in Cleveland; it is not due at a
 *    UTC millisecond, and storing it as a timestamp lets a DST boundary move a
 *    deadline by a day.
 * 2. **Money is integer cents.** Never a float, never a numeric read as a JS
 *    number; formatted once at the edge.
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
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- enums --- */

export const planEnum = pgEnum("plan", ["seed", "grow", "field"]);
export const roleEnum = pgEnum("member_role", ["owner", "member"]);
export const stageEnum = pgEnum("grant_stage", [
  "researching",
  "loi",
  "applying",
  "submitted",
  "awarded",
  "declined",
  "reporting",
  "closed",
]);
export const deadlineKindEnum = pgEnum("deadline_kind", [
  "loi",
  "application",
  "report",
  "renewal",
  "custom",
]);
export const answerKindEnum = pgEnum("answer_kind", [
  "mission_short",
  "mission_long",
  "program",
  "budget",
  "board_list",
  "attachment",
  "custom",
]);
export const workspaceStatusEnum = pgEnum("workspace_status", ["todo", "drafted", "final"]);
export const curationStatusEnum = pgEnum("curation_status", ["proposed", "approved", "retired"]);
export const funderKindEnum = pgEnum("funder_kind", [
  "private_foundation",
  "community",
  "corporate",
]);
export const grantSourceEnum = pgEnum("grant_source", ["discovery", "manual"]);
export const reminderStatusEnum = pgEnum("reminder_status", ["sent", "failed", "suppressed"]);

export type Plan = (typeof planEnum.enumValues)[number];
export type MemberRole = (typeof roleEnum.enumValues)[number];
export type GrantStage = (typeof stageEnum.enumValues)[number];
export type DeadlineKind = (typeof deadlineKindEnum.enumValues)[number];
export type AnswerKind = (typeof answerKindEnum.enumValues)[number];
export type WorkspaceStatus = (typeof workspaceStatusEnum.enumValues)[number];
export type CurationStatus = (typeof curationStatusEnum.enumValues)[number];
export type FunderKind = (typeof funderKindEnum.enumValues)[number];

/* ---------------------------------------------------------------- tenant --- */

/**
 * The org profile that feeds fit scoring. jsonb because it is read as a unit on
 * every discovery request and its shape is a product decision, not a relational
 * one. `profileVersion` bumps on every edit so cached scores can be invalidated
 * without diffing.
 */
export interface OrgProfile {
  mission: string;
  programs: string;
  budgetBand: string;
  serviceStates: string[];
  causeCodes: string[];
  ein: string;
  typicalAskCents: number | null;
}

export const EMPTY_PROFILE: OrgProfile = {
  mission: "",
  programs: "",
  budgetBand: "",
  serviceStates: [],
  causeCodes: [],
  ein: "",
  typicalAskCents: null,
};

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("seed"),
  /** IANA zone. Every deadline comparison happens here, not in UTC. */
  timezone: text("timezone").notNull().default("America/New_York"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  profile: jsonb("profile").$type<OrgProfile>().notNull().default(EMPTY_PROFILE),
  profileVersion: integer("profile_version").notNull().default(1),
  /** Days before a deadline that reminders go out. See lib/reminders.ts. */
  reminderOffsets: integer("reminder_offsets").array().notNull().default([14, 7, 1]),
  icsTokenHash: text("ics_token_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_org_user_key").on(t.organizationId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const grants = pgTable(
  "grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    funderId: uuid("funder_id").references((): typeof funders.id => funders.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    funderName: text("funder_name").notNull(),
    stage: stageEnum("stage").notNull().default("researching"),
    askAmountCents: bigint("ask_amount_cents", { mode: "number" }),
    awardedAmountCents: bigint("awarded_amount_cents", { mode: "number" }),
    awardRestrictions: text("award_restrictions"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    source: grantSourceEnum("source").notNull().default("manual"),
    /** Snapshot of the fit score at the moment it was added, for the record. */
    fitScoreAtAdd: integer("fit_score_at_add"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("grants_org_stage_idx").on(t.organizationId, t.stage)],
);

export const deadlines = pgTable(
  "deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grants.id, { onDelete: "cascade" }),
    kind: deadlineKindEnum("kind").notNull(),
    /** Calendar date in the org's timezone — read as "YYYY-MM-DD". */
    dueOn: date("due_on", { mode: "string" }).notNull(),
    label: text("label").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deadlines_due_idx").on(t.dueOn, t.completedAt),
    index("deadlines_grant_idx").on(t.grantId),
    index("deadlines_org_idx").on(t.organizationId),
  ],
);

export const answers = pgTable(
  "answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: answerKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    fileRef: text("file_ref"),
    version: integer("version").notNull().default(1),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("answers_org_idx").on(t.organizationId, t.kind)],
);

export const workspaceItems = pgTable(
  "workspace_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => grants.id, { onDelete: "cascade" }),
    requirement: text("requirement").notNull(),
    answerId: uuid("answer_id").references(() => answers.id, { onDelete: "set null" }),
    /** Breadcrumb of what was snapshotted, e.g. "Mission (long) · V4". */
    answerSource: text("answer_source"),
    status: workspaceStatusEnum("status").notNull().default("todo"),
    draftBody: text("draft_body").notNull().default(""),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workspace_items_grant_idx").on(t.grantId, t.position)],
);

/**
 * The reminder ledger — one row per (deadline, rung) actually sent. The unique
 * index is the exactly-once guarantee: a scan that runs twice in a day, or two
 * overlapping scans, cannot double-send.
 *
 * `offsetDays` is days *before* the due date. A negative value is the single
 * pinned overdue notice (-1 == "the day after it was due"), which is what stops
 * an overdue deadline mailing someone every morning forever.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    deadlineId: uuid("deadline_id")
      .notNull()
      .references(() => deadlines.id, { onDelete: "cascade" }),
    offsetDays: integer("offset_days").notNull(),
    /** The org-local date the notice was scheduled for, "YYYY-MM-DD". */
    scheduledFor: date("scheduled_for", { mode: "string" }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    recipients: text("recipients").array().notNull().default(sql`'{}'::text[]`),
    /**
     * `sent` and `suppressed` are terminal — the rung is spent. `failed` is
     * retried by a later sweep up to MAX_SEND_ATTEMPTS, because a transient
     * Resend error should not cost someone a deadline.
     */
    status: reminderStatusEnum("status").notNull().default("sent"),
    attempts: integer("attempts").notNull().default(0),
    detail: text("detail"),
  },
  (t) => [uniqueIndex("reminders_deadline_offset_key").on(t.deadlineId, t.offsetDays)],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    grantId: uuid("grant_id").references(() => grants.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    event: text("event").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_org_idx").on(t.organizationId, t.createdAt)],
);

/* ------------------------------------------------------- funder database --- */

export const funders = pgTable(
  "funders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ein: text("ein").notNull(),
    kind: funderKindEnum("kind").notNull(),
    city: text("city"),
    state: text("state"),
    statesFunded: text("states_funded").array().notNull().default(sql`'{}'::text[]`),
    causeCodes: text("cause_codes").array().notNull().default(sql`'{}'::text[]`),
    grantSizeMinCents: bigint("grant_size_min_cents", { mode: "number" }),
    grantSizeMaxCents: bigint("grant_size_max_cents", { mode: "number" }),
    /** null = unknown, and the UI must say "unknown", never assume "no". */
    acceptsUnsolicited: boolean("accepts_unsolicited"),
    applicationUrl: text("application_url"),
    deadlinesNote: text("deadlines_note"),
    /** Share of recent grantees new to the funder, 0-1, or null when unknown. */
    newGranteeShare: real("new_grantee_share"),
    /** Tax year / review date the record reflects — NOT the ingest run date. */
    dataFreshnessAt: date("data_freshness_at", { mode: "string" }),
    curationStatus: curationStatusEnum("curation_status").notNull().default("proposed"),
    /**
     * True for the demonstration records shipped with the app. Rendered as a
     * visible "SAMPLE" mark everywhere the record appears — this app must never
     * present illustrative funders as a live curated database.
     */
    isSample: boolean("is_sample").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("funders_ein_key").on(t.ein),
    index("funders_curation_idx").on(t.curationStatus),
  ],
);

export const funderAwards = pgTable(
  "funder_awards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    funderId: uuid("funder_id")
      .notNull()
      .references(() => funders.id, { onDelete: "cascade" }),
    taxYear: integer("tax_year").notNull(),
    recipientName: text("recipient_name").notNull(),
    recipientState: text("recipient_state"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    purposeExcerpt: text("purpose_excerpt"),
  },
  (t) => [
    // Idempotent ingestion: the same filing line re-parsed must not duplicate.
    uniqueIndex("funder_awards_dedupe_key").on(
      t.funderId,
      t.taxYear,
      t.recipientName,
      t.amountCents,
    ),
    index("funder_awards_funder_idx").on(t.funderId, t.taxYear),
  ],
);

export const funderChangeReports = pgTable("funder_change_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  funderId: uuid("funder_id")
    .notNull()
    .references(() => funders.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- relations --- */

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  grants: many(grants),
  answers: many(answers),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  organization: one(organizations, {
    fields: [memberships.organizationId],
    references: [organizations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const grantsRelations = relations(grants, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [grants.organizationId],
    references: [organizations.id],
  }),
  funder: one(funders, { fields: [grants.funderId], references: [funders.id] }),
  owner: one(users, { fields: [grants.ownerUserId], references: [users.id] }),
  deadlines: many(deadlines),
  workspaceItems: many(workspaceItems),
}));

export const deadlinesRelations = relations(deadlines, ({ one, many }) => ({
  grant: one(grants, { fields: [deadlines.grantId], references: [grants.id] }),
  reminders: many(reminders),
}));

export const workspaceItemsRelations = relations(workspaceItems, ({ one }) => ({
  grant: one(grants, { fields: [workspaceItems.grantId], references: [grants.id] }),
  answer: one(answers, { fields: [workspaceItems.answerId], references: [answers.id] }),
}));

export const fundersRelations = relations(funders, ({ many }) => ({
  awards: many(funderAwards),
}));

/* ----------------------------------------------------------------- types --- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Grant = typeof grants.$inferSelect;
export type Deadline = typeof deadlines.$inferSelect;
export type Answer = typeof answers.$inferSelect;
export type WorkspaceItem = typeof workspaceItems.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type Funder = typeof funders.$inferSelect;
export type FunderAward = typeof funderAwards.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
