/**
 * src/db/schema.ts
 *
 * Drizzle schema for TipTally — the complete data model from
 * ARCHITECTURE.md. Groups -> restaurants; rule versions are
 * append-only and effective-dated; shares store their derivations.
 */

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
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

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "house", "group", "hospitality"] })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  ...timestamps,
});

export const restaurants = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => groups.id),
  name: text("name").notNull(),
  state: text("state").notNull().default("TX"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** jsonb: { disputeWindowHours: 48, rounding: "largest_remainder" } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "manager"] }).notNull().default("manager"),
    restaurantIds: uuid("restaurant_ids").array().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  name: text("name").notNull(),
  roleKey: text("role_key").notNull(),
  /** jsonb: { toast?: string, square?: string } — import matching. */
  externalIds: jsonb("external_ids").notNull().default({}),
  email: text("email"),
  phone: text("phone"),
  linkTokenHash: text("link_token_hash"),
  status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
  ...timestamps,
});

export const pools = pgTable("pools", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  ...timestamps,
});

/** Append-only, effective-dated. Past shifts use their day's version. */
export const ruleVersions = pgTable(
  "rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poolId: uuid("pool_id").notNull().references(() => pools.id),
    version: integer("version").notNull(),
    effectiveOn: date("effective_on").notNull(),
    /**
     * jsonb: { participants: [{ roleKey, points }], hoursWeighted,
     * tipShares: [{ percentOfSalesBps?, percentOfTipsBps?, toRoleKey }],
     * exclusions: [roleKey] }
     */
    rules: jsonb("rules").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("rule_versions_pool_version_idx").on(t.poolId, t.version)],
);

/** Saved CSV column mappings per POS source. */
export const importSources = pgTable("import_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  name: text("name").notNull(),
  columnMap: jsonb("column_map").notNull().default({}),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  ...timestamps,
});

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
    serviceDate: date("service_date").notNull(),
    meal: text("meal", { enum: ["lunch", "dinner", "all_day"] }).notNull().default("all_day"),
    status: text("status", { enum: ["draft", "imported", "flagged", "closed", "locked"] })
      .notNull()
      .default("draft"),
    /** jsonb: { [poolId]: totalCents } */
    poolTotals: jsonb("pool_totals").notNull().default({}),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("shifts_restaurant_date_meal_idx").on(t.restaurantId, t.serviceDate, t.meal)],
);

/** Imported per-employee rows; flags resolve before close. */
export const shiftEntries = pgTable("shift_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  shiftId: uuid("shift_id").notNull().references(() => shifts.id),
  employeeId: uuid("employee_id").references(() => employees.id),
  rawName: text("raw_name").notNull(),
  roleKey: text("role_key"),
  hours: numeric("hours"),
  tipsCollectedCents: integer("tips_collected_cents").notNull().default(0),
  salesCents: integer("sales_cents").notNull().default(0),
  /** jsonb: string[] of flag kinds */
  flags: jsonb("flags").notNull().default([]),
  resolved: boolean("resolved").notNull().default(true),
  ...timestamps,
});

/** The output. derivation renders verbatim on three surfaces. */
export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id").notNull().references(() => shifts.id),
    poolId: uuid("pool_id").notNull().references(() => pools.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    amountCents: integer("amount_cents").notNull(),
    /** jsonb: ordered steps [{ label, expression, valueCents? }] */
    derivation: jsonb("derivation").notNull().default([]),
    ruleVersionId: uuid("rule_version_id").notNull().references(() => ruleVersions.id),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("shares_shift_pool_employee_idx").on(t.shiftId, t.poolId, t.employeeId)],
);

export const disputes = pgTable("disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  shareId: uuid("share_id").notNull().references(() => shares.id),
  note: text("note").notNull(),
  status: text("status", { enum: ["open", "resolved_adjusted", "resolved_upheld"] })
    .notNull()
    .default("open"),
  resolutionNote: text("resolution_note"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Export locks the period's shifts. */
export const payrollExports = pgTable("payroll_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  format: text("format", { enum: ["gusto", "adp", "paychex", "generic"] }).notNull(),
  csvContent: text("csv_content").notNull(),
  exportedBy: uuid("exported_by").references(() => users.id),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Guidance content, sourced and dated — never legal advice. */
export const complianceNotes = pgTable("compliance_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  state: text("state").notNull(),
  topic: text("topic", { enum: ["participation", "tip_credit", "pooling"] }).notNull(),
  body: text("body").notNull(),
  /** jsonb: [{ label, url }] */
  sources: jsonb("sources").notNull().default([]),
  updatedOn: date("updated_on").notNull(),
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
  restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
