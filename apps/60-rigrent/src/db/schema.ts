/**
 * src/db/schema.ts
 *
 * Drizzle schema for RigRent — the data model from ARCHITECTURE.md.
 * Multi-tenant off `accounts.id`. Availability is a SQL aggregation over
 * date-overlapping booked lines, so this schema is where that correctness
 * lives: `out_on` / `due_back_on` are `date` columns (a rental window is
 * calendar days, not instants) and the composite index on
 * `(account_id, out_on, due_back_on)` is the one the overlap query rides.
 *
 * Three deliberate changes to the scaffold, each fixing a defect that has
 * shipped inside a green build elsewhere in this portfolio:
 *
 *  1. **Money is `bigint`, not `integer`.** int4 stops at 2.147e9, so a total
 *     of $21.5M throws `22003 out of range` on first real use. A production
 *     yard renting an entire festival build-out is nowhere near that, but the
 *     column costs nothing and the failure mode is a 500 on the money screen.
 *     `mode: "number"` keeps JS numbers (exact to 2^53 cents = $90 trillion).
 *  2. **`orders.number`** — a per-account human order number. The overbooked
 *     block has to *name the conflicting order*, and "the order with id
 *     3f2a…" is not naming it.
 *  3. **`notices`** — one row per (order, rung) with a unique index, so a
 *     return reminder cannot mail the same customer every night for eternity
 *     (the "notifications that never stop" defect) and a ladder cannot go
 *     silent after its loosest rung (its mirror).
 */

import {
  bigint,
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

/** Money: minor units, bigint, never a float and never int4. */
const cents = (name: string) => bigint(name, { mode: "number" });

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "yard", "fleet", "pro"] }).notNull().default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Verbatim Stripe subscription status; entitlement is derived from it. */
  subscriptionStatus: text("subscription_status"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** Connect account carrying customer deposit holds. */
  stripeAccountId: text("stripe_account_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** jsonb: { depositPercentBps, taxRateBps, damageFeeDefaults, terms } — see lib/settings.ts */
  settings: jsonb("settings").notNull().default({}),
  /** Next order number to hand out. Bumped inside the create transaction. */
  nextOrderNumber: integer("next_order_number").notNull().default(1001),
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

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("customers_account_idx").on(t.accountId, t.name)],
);

/** The catalog. `tracked_by: "serial"` adds `units` rows. */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    name: text("name").notNull(),
    category: text("category"),
    ownedCount: integer("owned_count").notNull().default(1),
    replacementCents: cents("replacement_cents"),
    dailyRateCents: cents("daily_rate_cents").notNull(),
    weekendRateCents: cents("weekend_rate_cents"),
    /** jsonb: [{ label: "Torn seat", amountCents: 1500 }] */
    damageFees: jsonb("damage_fees").notNull().default([]),
    trackedBy: text("tracked_by", { enum: ["quantity", "serial"] }).notNull().default("quantity"),
    status: text("status", { enum: ["active", "retired"] }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [index("items_account_idx").on(t.accountId, t.status, t.name)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => items.id),
    serial: text("serial").notNull(),
    status: text("status", { enum: ["in_service", "maintenance", "lost"] })
      .notNull()
      .default("in_service"),
    ...timestamps,
  },
  (t) => [uniqueIndex("units_item_serial_idx").on(t.itemId, t.serial)],
);

/** Availability subtracts these alongside booked lines. */
export const maintenanceHolds = pgTable(
  "maintenance_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => items.id),
    unitId: uuid("unit_id").references(() => units.id),
    quantity: integer("quantity").notNull().default(1),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [index("holds_item_window_idx").on(t.itemId, t.startsOn, t.endsOn)],
);

/** Quote → order: one object through its whole life. */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id),
    /** Human order number, unique per account. The overbooked block names this. */
    number: integer("number").notNull(),
    status: text("status", {
      enum: ["draft", "sent", "accepted", "confirmed", "out", "returned", "closed", "cancelled"],
    })
      .notNull()
      .default("draft"),
    eventStart: timestamp("event_start", { withTimezone: true }),
    eventEnd: timestamp("event_end", { withTimezone: true }),
    /**
     * The availability window, half-open: gear is unavailable to anyone else on
     * `[out_on, due_back_on)`. Gear back on the 9th can leave again on the 9th,
     * which is exactly what a same-day turnaround means.
     */
    outOn: date("out_on").notNull(),
    dueBackOn: date("due_back_on").notNull(),
    delivery: boolean("delivery").notNull().default(false),
    address: text("address"),
    subtotalCents: cents("subtotal_cents").notNull().default(0),
    taxCents: cents("tax_cents").notNull().default(0),
    totalCents: cents("total_cents").notNull().default(0),
    depositCents: cents("deposit_cents").notNull().default(0),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositStatus: text("deposit_status", {
      enum: ["none", "held", "captured_partial", "captured", "released", "expired"],
    })
      .notNull()
      .default("none"),
    /** When the current authorisation was placed — holds expire about 7 days out. */
    depositAuthorizedAt: timestamp("deposit_authorized_at", { withTimezone: true }),
    depositCapturedCents: cents("deposit_captured_cents").notNull().default(0),
    /** Set when a re-authorisation attempt failed; surfaced on the order. */
    depositError: text("deposit_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    signTokenHash: text("sign_token_hash"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signerName: text("signer_name"),
    signerInitials: text("signer_initials"),
    signatureR2Key: text("signature_r2_key"),
    contractR2Key: text("contract_r2_key"),
    docHash: text("doc_hash"),
    outAt: timestamp("out_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("orders_account_window_idx").on(t.accountId, t.outOn, t.dueBackOn),
    uniqueIndex("orders_account_number_idx").on(t.accountId, t.number),
    index("orders_status_idx").on(t.accountId, t.status),
  ],
);

/** Availability reads booked lines overlapping the window. */
export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    itemId: uuid("item_id").notNull().references(() => items.id),
    quantity: integer("quantity").notNull(),
    /** Per-unit price for the whole window (a weekend rate is one flat number). */
    rateCents: cents("rate_cents").notNull(),
    lineTotalCents: cents("line_total_cents").notNull(),
    ...timestamps,
  },
  (t) => [index("order_lines_item_idx").on(t.itemId), index("order_lines_order_idx").on(t.orderId)],
);

/** Delivery/pickup batches with per-truck load lists. */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    kind: text("kind", { enum: ["delivery", "pickup"] }).notNull(),
    runOn: date("run_on").notNull(),
    truckLabel: text("truck_label"),
    driverUserId: uuid("driver_user_id").references(() => users.id),
    /** Order ids in stop sequence. The driver's screen follows this array. */
    stopOrder: uuid("stop_order").array().notNull().default([]),
    status: text("status", { enum: ["planned", "loaded", "out", "done"] })
      .notNull()
      .default("planned"),
    sheetR2Key: text("sheet_r2_key"),
    ...timestamps,
  },
  (t) => [index("runs_account_date_idx").on(t.accountId, t.runOn)],
);

/** Per-line condition events; the photo pair = out vs in for one line. */
export const checks = pgTable(
  "checks",
  {
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
  },
  (t) => [uniqueIndex("checks_line_direction_idx").on(t.orderLineId, t.direction)],
);

export const conditionPhotos = pgTable(
  "condition_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkId: uuid("check_id").notNull().references(() => checks.id),
    r2Key: text("r2_key").notNull(),
    caption: text("caption"),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("condition_photos_check_idx").on(t.checkId)],
);

/**
 * Damage draws on the hold. Stripe allows exactly one capture per
 * PaymentIntent, so all charged claims on an order settle in a single partial
 * capture and share its id — see lib/claims.ts.
 */
export const damageClaims = pgTable(
  "damage_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    orderLineId: uuid("order_line_id").notNull().references(() => orderLines.id),
    kind: text("kind", { enum: ["damage", "missing"] }).notNull(),
    description: text("description").notNull(),
    amountCents: cents("amount_cents").notNull(),
    photoIds: uuid("photo_ids").array().notNull().default([]),
    status: text("status", { enum: ["draft", "charged", "waived", "disputed"] })
      .notNull()
      .default("draft"),
    stripeCaptureId: text("stripe_capture_id"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("claims_order_idx").on(t.orderId)],
);

/**
 * One row per notice actually sent, keyed by the rung it satisfies. The unique
 * index is the whole point: it is what stops a daily sweep from mailing the
 * same overdue customer for the rest of time, and what lets the ladder pick
 * the *tightest* crossed rung without re-sending the looser ones.
 */
export const notices = pgTable(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    /** "due_tomorrow" | "overdue_1" | "overdue_3" | "overdue_7" | "overdue_14" */
    rung: text("rung").notNull(),
    sentTo: text("sent_to"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notices_order_rung_idx").on(t.orderId, t.rung)],
);

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

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("audit_account_idx").on(t.accountId, t.createdAt)],
);

/* ------------------------------------------------------------------ types --- */

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Item = typeof items.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type MaintenanceHold = typeof maintenanceHolds.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Check = typeof checks.$inferSelect;
export type ConditionPhoto = typeof conditionPhotos.$inferSelect;
export type DamageClaim = typeof damageClaims.$inferSelect;
export type Notice = typeof notices.$inferSelect;

export type Plan = Account["plan"];
export type OrderStatus = Order["status"];
export type DepositStatus = Order["depositStatus"];
export type RunStatus = Run["status"];
export type UserRole = User["role"];

/** A damage fee schedule entry, as stored in `items.damage_fees`. */
export interface DamageFee {
  label: string;
  amountCents: number;
}
