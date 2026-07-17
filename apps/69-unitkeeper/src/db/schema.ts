/**
 * src/db/schema.ts
 *
 * Drizzle schema for UnitKeeper — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off owners.id. The ledger is
 * append-only; lien cases freeze their rule version.
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

export const owners = pgTable(
  "owners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    plan: text("plan", { enum: ["trial", "keeper", "yard", "depot"] })
      .notNull()
      .default("trial"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeAccountId: text("stripe_account_id"),
    /** jsonb: { lateLadder: [{ day, action, feeCents }], prorateRule } */
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("owners_email_idx").on(t.email)],
);

export const facilities = pgTable("facilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id),
  name: text("name").notNull(),
  address: text("address"),
  state: text("state").notNull().default("TX"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  gateSystem: text("gate_system"),
  ...timestamps,
});

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    label: text("label").notNull(),
    size: text("size").notNull(),
    monthlyRateCents: integer("monthly_rate_cents").notNull(),
    /** jsonb: { row, col, w, h } */
    mapPosition: jsonb("map_position").notNull().default({}),
    status: text("status", {
      enum: ["vacant", "occupied", "overdue", "lien", "maintenance"],
    })
      .notNull()
      .default("vacant"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("units_facility_label_idx").on(t.facilityId, t.label)],
);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  /** The legal notice address — lien mail goes here. */
  address: text("address"),
  alternateContact: jsonb("alternate_contact"),
  stripeCustomerId: text("stripe_customer_id"),
  ...timestamps,
});

export const tenancies = pgTable("tenancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  rateCents: integer("rate_cents").notNull(),
  startedOn: date("started_on").notNull(),
  endedOn: date("ended_on"),
  status: text("status", { enum: ["active", "delinquent", "lien", "ended"] })
    .notNull()
    .default("active"),
  leaseR2Key: text("lease_r2_key"),
  leaseHash: text("lease_hash"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  gateCode: text("gate_code"),
  gateCodeStatus: text("gate_code_status", { enum: ["active", "revoked", "overlocked"] })
    .notNull()
    .default("active"),
  autopay: boolean("autopay").notNull().default(true),
  stripeSubscriptionId: text("stripe_subscription_id"),
  ...timestamps,
});

/** Append-only; the lien packet prints this verbatim. */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id").notNull().references(() => tenancies.id),
    kind: text("kind", {
      enum: ["rent", "late_fee", "lien_fee", "payment", "credit", "refund", "adjustment"],
    }).notNull(),
    /** Signed: charges positive, payments negative. */
    amountCents: integer("amount_cents").notNull(),
    description: text("description").notNull(),
    occurredOn: date("occurred_on").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    ...timestamps,
  },
  (t) => [index("ledger_entries_tenancy_idx").on(t.tenancyId, t.occurredOn)],
);

/** Per-state statute data, versioned, citation-carrying. */
export const lienRules = pgTable(
  "lien_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    state: text("state").notNull(),
    version: integer("version").notNull(),
    /**
     * jsonb: [{ key, label, citation, offsetDays, from:
     * "delinquency" | "prior_step", requires: string[] }]
     */
    steps: jsonb("steps").notNull(),
    reviewedOn: date("reviewed_on").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("lien_rules_state_version_idx").on(t.state, t.version)],
);

/** The state machine; rule version frozen at open. */
export const lienCases = pgTable("lien_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenancyId: uuid("tenancy_id").notNull().references(() => tenancies.id),
  ruleVersionId: uuid("rule_version_id").notNull().references(() => lienRules.id),
  delinquentSince: date("delinquent_since").notNull(),
  status: text("status", {
    enum: ["open", "paused", "resolved", "sale_eligible", "closed"],
  })
    .notNull()
    .default("open"),
  currentStepKey: text("current_step_key"),
  /** jsonb: per step { dueOn, completedOn, noticeR2Key, trackingNumber } */
  stepsState: jsonb("steps_state").notNull().default({}),
  hardStopUntil: date("hard_stop_until"),
  resolvedReason: text("resolved_reason", { enum: ["paid", "vacated", "sold", "error"] }),
  ...timestamps,
});

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  lienCaseId: uuid("lien_case_id").references(() => lienCases.id),
  tenancyId: uuid("tenancy_id").notNull().references(() => tenancies.id),
  kind: text("kind", {
    enum: ["late", "lien_default", "lien_sale", "rate_change", "statement"],
  }).notNull(),
  r2Key: text("r2_key").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  /** jsonb: { emailed: bool, certified: bool, trackingNumber? } */
  sentVia: jsonb("sent_via").notNull().default({}),
});

export const rateChanges = pgTable("rate_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  tenancyId: uuid("tenancy_id").references(() => tenancies.id),
  oldCents: integer("old_cents").notNull(),
  newCents: integer("new_cents").notNull(),
  effectiveOn: date("effective_on").notNull(),
  noticeId: uuid("notice_id").references(() => notices.id),
  status: text("status", { enum: ["noticed", "applied"] }).notNull().default("noticed"),
  ...timestamps,
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
  ownerId: uuid("owner_id").notNull().references(() => owners.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
