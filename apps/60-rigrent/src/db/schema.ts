/**
 * src/db/schema.ts
 *
 * Drizzle schema for RigRent — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off accounts.id. Availability is a SQL
 * aggregation over date-overlapping confirmed lines — this schema is
 * where that correctness lives.
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
  plan: text("plan", { enum: ["trial", "yard", "fleet", "pro"] }).notNull().default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Connect account carrying customer deposit holds. */
  stripeAccountId: text("stripe_account_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** jsonb: { depositDefaultPercent, taxRateBps, damageFeeDefaults } */
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
    role: text("role", { enum: ["owner", "staff", "driver"] }).notNull().default("staff"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  notes: text("notes"),
  ...timestamps,
});

/** The catalog. tracked_by "serial" adds units rows. */
export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  name: text("name").notNull(),
  category: text("category"),
  ownedCount: integer("owned_count").notNull().default(1),
  replacementCents: integer("replacement_cents"),
  dailyRateCents: integer("daily_rate_cents").notNull(),
  weekendRateCents: integer("weekend_rate_cents"),
  /** jsonb: [{ label: "Torn seat", amountCents: 1500 }] */
  damageFees: jsonb("damage_fees").notNull().default([]),
  trackedBy: text("tracked_by", { enum: ["quantity", "serial"] }).notNull().default("quantity"),
  status: text("status", { enum: ["active", "retired"] }).notNull().default("active"),
  ...timestamps,
});

export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => items.id),
  serial: text("serial").notNull(),
  status: text("status", { enum: ["in_service", "maintenance", "lost"] })
    .notNull()
    .default("in_service"),
  ...timestamps,
});

/** Availability subtracts these alongside booked lines. */
export const maintenanceHolds = pgTable("maintenance_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id").notNull().references(() => items.id),
  unitId: uuid("unit_id").references(() => units.id),
  quantity: integer("quantity").notNull().default(1),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  reason: text("reason"),
  ...timestamps,
});

/** Quote -> order: one object through its whole life. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    status: text("status", {
      enum: ["draft", "sent", "accepted", "confirmed", "out", "returned", "closed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    eventStart: timestamp("event_start", { withTimezone: true }),
    eventEnd: timestamp("event_end", { withTimezone: true }),
    /** Availability window: gear leaves and returns on these dates. */
    outOn: date("out_on").notNull(),
    dueBackOn: date("due_back_on").notNull(),
    delivery: boolean("delivery").notNull().default(false),
    address: text("address"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    depositCents: integer("deposit_cents").notNull().default(0),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositStatus: text("deposit_status", {
      enum: ["none", "held", "captured_partial", "captured", "released", "expired"],
    })
      .notNull()
      .default("none"),
    signTokenHash: text("sign_token_hash"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signatureR2Key: text("signature_r2_key"),
    docHash: text("doc_hash"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("orders_account_window_idx").on(t.accountId, t.outOn, t.dueBackOn)],
);

/** Availability checks read confirmed/out lines overlapping the window. */
export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  itemId: uuid("item_id").notNull().references(() => items.id),
  quantity: integer("quantity").notNull(),
  rateCents: integer("rate_cents").notNull(),
  lineTotalCents: integer("line_total_cents").notNull(),
  ...timestamps,
});

/** Delivery/pickup batches with per-truck load lists. */
export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  kind: text("kind", { enum: ["delivery", "pickup"] }).notNull(),
  runOn: date("run_on").notNull(),
  truckLabel: text("truck_label"),
  driverUserId: uuid("driver_user_id").references(() => users.id),
  stopOrder: uuid("stop_order").array().notNull().default([]),
  status: text("status", { enum: ["planned", "loaded", "out", "done"] })
    .notNull()
    .default("planned"),
  sheetR2Key: text("sheet_r2_key"),
  ...timestamps,
});

/** Per-line condition events; the photo pair = out vs in for a line. */
export const checks = pgTable("checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderLineId: uuid("order_line_id").notNull().references(() => orderLines.id),
  direction: text("direction", { enum: ["out", "in"] }).notNull(),
  quantityOk: integer("quantity_ok").notNull().default(0),
  quantityDamaged: integer("quantity_damaged").notNull().default(0),
  quantityMissing: integer("quantity_missing").notNull().default(0),
  checkedBy: uuid("checked_by").references(() => users.id),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
  ...timestamps,
});

export const conditionPhotos = pgTable("condition_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkId: uuid("check_id").notNull().references(() => checks.id),
  r2Key: text("r2_key").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Damage draws exactly the claim amount from the hold (partial capture). */
export const damageClaims = pgTable("damage_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  orderLineId: uuid("order_line_id").notNull().references(() => orderLines.id),
  kind: text("kind", { enum: ["damage", "missing"] }).notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  photoIds: uuid("photo_ids").array().notNull().default([]),
  status: text("status", { enum: ["draft", "charged", "waived", "disputed"] })
    .notNull()
    .default("draft"),
  stripeCaptureId: text("stripe_capture_id"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
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
  accountId: uuid("account_id").notNull().references(() => accounts.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
