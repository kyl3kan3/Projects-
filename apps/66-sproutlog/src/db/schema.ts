/**
 * src/db/schema.ts
 *
 * Drizzle schema for SproutLog — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off providers.id. log_events is the
 * append-only spine; registers, meal counts, and digests are
 * projections of it.
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

export const providers = pgTable(
  "providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    homeName: text("home_name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    plan: text("plan", { enum: ["trial", "nest", "grove", "orchard"] })
      .notNull()
      .default("trial"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeAccountId: text("stripe_account_id"),
    licenseCapacity: integer("license_capacity").notNull().default(8),
    timezone: text("timezone").notNull().default("America/Chicago"),
    /** jsonb: { digestSendTime: "17:00", lateFeeRules, stateFormat } */
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("providers_email_idx").on(t.email)],
);

export const assistants = pgTable("assistants", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  emails: text("emails").array().notNull().default([]),
  phone: text("phone"),
  /** Customer on the provider's Connect account. */
  stripeCustomerId: text("stripe_customer_id"),
  paymentMethodOk: boolean("payment_method_ok").notNull().default(false),
  digestOptOut: boolean("digest_opt_out").notNull().default(false),
  ...timestamps,
});

export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  birthdate: date("birthdate"),
  allergies: text("allergies"),
  /** jsonb: [{ name, relation, phone }] */
  authorizedPickups: jsonb("authorized_pickups").notNull().default([]),
  emergencyContacts: jsonb("emergency_contacts").notNull().default([]),
  enrolled: boolean("enrolled").notNull().default(true),
  /** jsonb: { weekdays: [1,2,3,4,5] } */
  schedule: jsonb("schedule").notNull().default({}),
  /** jsonb: { amountCents, interval: "weekly" | "monthly" } */
  tuition: jsonb("tuition").notNull().default({}),
  ...timestamps,
});

/** The append-only spine. Corrections are new events, never edits. */
export const logEvents = pgTable(
  "log_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull().references(() => providers.id),
    childId: uuid("child_id").references(() => children.id),
    kind: text("kind", {
      enum: [
        "arrival",
        "departure",
        "meal",
        "nap_start",
        "nap_end",
        "diaper",
        "potty",
        "incident",
        "photo",
        "note",
        "ratio_flag",
      ],
    }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** jsonb per kind: meal components, diaper details, photo r2Key, note text */
    data: jsonb("data").notNull().default({}),
    loggedBy: text("logged_by").notNull(),
    ...timestamps,
  },
  (t) => [
    index("log_events_provider_at_idx").on(t.providerId, t.at),
    index("log_events_child_at_idx").on(t.childId, t.at),
  ],
);

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  childId: uuid("child_id").notNull().references(() => children.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  description: text("description").notNull(),
  actionTaken: text("action_taken").notNull(),
  parentNotifiedAt: timestamp("parent_notified_at", { withTimezone: true }),
  signatureR2Key: text("signature_r2_key"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  pdfR2Key: text("pdf_r2_key"),
  ...timestamps,
});

export const menus = pgTable(
  "menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull().references(() => providers.id),
    weekOf: date("week_of").notNull(),
    /** jsonb: per day per meal, CACFP components */
    meals: jsonb("meals").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("menus_provider_week_idx").on(t.providerId, t.weekOf)],
);

/** Digest send ledger; what the parent saw is reproducible. */
export const digests = pgTable(
  "digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull().references(() => providers.id),
    familyId: uuid("family_id").notNull().references(() => families.id),
    forDate: date("for_date").notNull(),
    /** jsonb: { sentences: [...], photoKeys: [...] } */
    compiled: jsonb("compiled").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("digests_family_date_idx").on(t.familyId, t.forDate)],
);

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  amountCents: integer("amount_cents").notNull(),
  lateFeeCents: integer("late_fee_cents").notNull().default(0),
  status: text("status", {
    enum: ["draft", "scheduled", "paid", "past_due", "void"],
  })
    .notNull()
    .default("draft"),
  stripeInvoiceId: text("stripe_invoice_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...timestamps,
});

/** Projection cache for registers; rebuilt from log_events only. */
export const attendanceDays = pgTable(
  "attendance_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id").notNull().references(() => children.id),
    date: date("date").notNull(),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    departedAt: timestamp("departed_at", { withTimezone: true }),
    hours: numeric("hours"),
  },
  (t) => [uniqueIndex("attendance_days_child_date_idx").on(t.childId, t.date)],
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

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: uuid("provider_id").notNull().references(() => providers.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
