/**
 * src/db/schema.ts
 *
 * Drizzle schema for ListingLoop — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off accounts.id. Date rules are data;
 * computed dates are rows; recomputes are a diff ledger.
 */

import {
  boolean,
  date,
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

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "solo", "desk", "office"] }).notNull().default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  state: text("state").notNull().default("TX"),
  /** jsonb: { reminderOffsets: [7,3,1], businessDayRules } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "tc", "agent"] }).notNull().default("tc"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Shared holiday calendar data; the date engine reads this. */
export const holidays = pgTable(
  "holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    date: date("date").notNull(),
    label: text("label").notNull(),
    scope: text("scope").notNull().default("us"),
  },
  (t) => [uniqueIndex("holidays_scope_date_idx").on(t.scope, t.date)],
);

export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  contractType: text("contract_type", { enum: ["listing", "buyer", "dual", "lease"] }).notNull(),
  /**
   * jsonb: [{ key, label, ownerRole, docRequired, dateRule?: {
   *   anchor, offsetDays, businessDays, observeHolidays } }]
   */
  tasks: jsonb("tasks").notNull().default([]),
  ...timestamps,
});

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    address: text("address").notNull(),
    mlsNumber: text("mls_number"),
    contractType: text("contract_type", { enum: ["listing", "buyer", "dual", "lease"] }).notNull(),
    status: text("status", {
      enum: ["active", "pending_items", "clear_to_close", "closed", "terminated"],
    })
      .notNull()
      .default("active"),
    priceCents: integer("price_cents"),
    contractDate: date("contract_date"),
    acceptanceDate: date("acceptance_date"),
    closingDate: date("closing_date"),
    templateId: uuid("template_id").references(() => checklistTemplates.id),
    /** jsonb: { rateBps, split: [{label, bps}], tcFeeCents } */
    commission: jsonb("commission").notNull().default({}),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("deals_account_status_idx").on(t.accountId, t.status)],
);

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id),
  role: text("role", {
    enum: [
      "buyer",
      "seller",
      "buyer_agent",
      "listing_agent",
      "lender",
      "title",
      "hoa",
      "tc",
      "other",
    ],
  }).notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  portalTokenHash: text("portal_token_hash"),
  notify: boolean("notify").notNull().default(true),
  ...timestamps,
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id),
  key: text("key").notNull(),
  label: text("label").notNull(),
  ownerRole: text("owner_role").notNull(),
  status: text("status", { enum: ["todo", "waiting", "done", "na"] }).notNull().default("todo"),
  docRequired: boolean("doc_required").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedBy: uuid("completed_by").references(() => users.id),
  sortOrder: integer("sort_order").notNull().default(0),
  ...timestamps,
});

/** Computed rows; every date can explain itself. */
export const criticalDates = pgTable(
  "critical_dates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id").notNull().references(() => deals.id),
    taskId: uuid("task_id").references(() => tasks.id),
    key: text("key").notNull(),
    label: text("label").notNull(),
    /** jsonb: the source rule { anchor, offsetDays, businessDays, observeHolidays } */
    rule: jsonb("rule").notNull(),
    dueOn: date("due_on").notNull(),
    /** jsonb: { anchor, anchorValue } */
    computedFrom: jsonb("computed_from").notNull(),
    status: text("status", { enum: ["upcoming", "met", "missed", "waived"] })
      .notNull()
      .default("upcoming"),
    metAt: timestamp("met_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("critical_dates_deal_due_idx").on(t.dealId, t.dueOn)],
);

/** The diff ledger: the preview the TC approves IS this row. */
export const dateRecomputes = pgTable("date_recomputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id),
  changedAnchor: text("changed_anchor").notNull(),
  oldValue: date("old_value"),
  newValue: date("new_value").notNull(),
  /** jsonb: [{ key, oldDue, newDue, reason }] */
  diff: jsonb("diff").notNull(),
  appliedBy: uuid("applied_by").references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Exactly-once reminder ledger. */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    criticalDateId: uuid("critical_date_id").notNull().references(() => criticalDates.id),
    offsetDays: integer("offset_days").notNull(),
    /** jsonb: [{ partyId, email }] */
    sentTo: jsonb("sent_to").notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminders_date_offset_idx").on(t.criticalDateId, t.offsetDays)],
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id),
  taskId: uuid("task_id").references(() => tasks.id),
  label: text("label").notNull(),
  r2Key: text("r2_key").notNull(),
  filename: text("filename").notNull(),
  version: integer("version").notNull().default(1),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The file's memory. */
export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id").notNull().references(() => deals.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
