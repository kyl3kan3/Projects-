/**
 * src/db/schema.ts
 *
 * Drizzle schema for UnitKeeper — the data model from ARCHITECTURE.md.
 * Multi-tenant off owners.id. The ledger is append-only; lien cases freeze
 * their rule version.
 *
 * Three additions to the scaffolded model, each forced by a rule the docs state
 * but the model could not enforce:
 *
 *  1. `ledger_entries.period` plus a unique index on
 *     (tenancy_id, kind, period). Monthly rent must post exactly once per
 *     billing period no matter how many times the tick runs, and "check whether
 *     a row exists first" is not exactly-once. Rows with no period (payments,
 *     adjustments) leave it null, and Postgres treats nulls as distinct, so
 *     they are unconstrained.
 *  2. `ladder_events` with a unique index on
 *     (tenancy_id, cycle_key, day, action). BUILD.md: "the late ladder fires
 *     exactly once per step and reverses cleanly on payment". The unique index
 *     is what makes that true under a retry, and `reversed_on` is what makes the
 *     reversal auditable instead of a delete.
 *  3. `tenancies.paid_through` — the period rent has been charged through, so
 *     autopay knows where it is without re-deriving it from the whole ledger.
 *
 * And on `owners`, three billing columns (`subscription_status`,
 * `current_period_end`, `trial_ends_at`): a `plan` column alone cannot tell a
 * paying account from one that cancelled last March, and an account whose
 * subscription ended must not keep the lien engine forever.
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
    /**
     * Billing state, so entitlement is a fact rather than a guess. A plan column
     * on its own cannot tell "paying" from "cancelled last March", and an
     * account whose subscription ended must not keep the lien engine forever.
     */
    subscriptionStatus: text("subscription_status"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
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
  /** Payment method vaulted on the owner's Connect account, if any. */
  stripePaymentMethodId: text("stripe_payment_method_id"),
  /** The last period ("YYYY-MM") rent has been charged for. */
  paidThrough: text("paid_through"),
  /** Move-out bookkeeping: what the make-ready checklist says. */
  makeReady: jsonb("make_ready").notNull().default({}),
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
    /**
     * "YYYY-MM" for anything that may only exist once per billing period (rent,
     * a ladder late fee). Null for everything else; nulls are distinct in a
     * Postgres unique index, so payments and adjustments stay unconstrained.
     */
    period: text("period"),
    ...timestamps,
  },
  (t) => [
    index("ledger_entries_tenancy_idx").on(t.tenancyId, t.occurredOn),
    uniqueIndex("ledger_entries_period_idx").on(t.tenancyId, t.kind, t.period),
  ],
);

/**
 * One row per ladder rung fired, per delinquency cycle. The unique index is the
 * exactly-once guarantee — a retried tick collides instead of charging a second
 * late fee. Payment does not delete these rows, it stamps `reversedOn`: the lien
 * packet has to be able to print what happened and when it was undone.
 */
export const ladderEvents = pgTable(
  "ladder_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    /** The delinquency cycle this rung belongs to: the period that went unpaid. */
    cycleKey: text("cycle_key").notNull(),
    day: integer("day").notNull(),
    action: text("action", {
      enum: ["retry", "late_fee", "overlock", "lien_eligible"],
    }).notNull(),
    firedOn: date("fired_on").notNull(),
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id),
    reversedOn: date("reversed_on"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ladder_events_rung_idx").on(t.tenancyId, t.cycleKey, t.day, t.action),
    index("ladder_events_tenancy_idx").on(t.tenancyId),
  ],
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

/* ------------------------------------------------------------------ types --- */

export type Owner = typeof owners.$inferSelect;
export type Facility = typeof facilities.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Tenancy = typeof tenancies.$inferSelect;
export type LedgerEntry = typeof ledgerEntries.$inferSelect;
export type LedgerKind = LedgerEntry["kind"];
export type LadderEvent = typeof ladderEvents.$inferSelect;
export type LadderAction = LadderEvent["action"];
export type LienRule = typeof lienRules.$inferSelect;
export type LienCase = typeof lienCases.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type RateChange = typeof rateChanges.$inferSelect;
export type Plan = Owner["plan"];
export type UnitStatus = Unit["status"];

/** The shape stored in `units.map_position`. */
export interface MapPosition {
  row: number;
  col: number;
  w: number;
  h: number;
}

/** The shape stored in `owners.settings`. */
export interface OwnerSettings {
  lateLadder: Array<{ day: number; action: LadderAction; feeCents?: number }>;
  /** How the first and last month are priced. */
  prorateRule: "daily" | "full_month";
  /** Day of the month rent falls due. */
  rentDueDay: number;
  /** Printed on leases and notices. */
  legalName: string;
  facilityTerms: string;
}

/**
 * The ladder an owner gets on day one, straight from ARCHITECTURE.md's flow 2:
 * retry day 3, late fee day 6, overlock day 11, lien-eligible day 30 (the day
 * the engine will *offer* to open a case — it never opens one by itself).
 */
export const DEFAULT_SETTINGS: OwnerSettings = {
  lateLadder: [
    { day: 3, action: "retry" },
    { day: 6, action: "late_fee", feeCents: 2000 },
    { day: 11, action: "overlock" },
    { day: 30, action: "lien_eligible" },
  ],
  prorateRule: "daily",
  rentDueDay: 1,
  legalName: "",
  facilityTerms:
    "Tenant stores at tenant's own risk. Insurance is tenant's responsibility. " +
    "Rent is due on the 1st of each month. Unpaid rent may result in overlock " +
    "and, after the statutory notice period, sale of the contents under the " +
    "self-storage lien statute of the facility's state.",
};

/** The make-ready checklist a unit runs through between tenants. */
export const MAKE_READY_ITEMS = [
  "Swept and empty",
  "Door and latch operate",
  "Overlock removed",
  "Interior light works",
  "No water intrusion",
  "Gate code revoked",
] as const;
