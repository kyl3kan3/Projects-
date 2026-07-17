/**
 * src/db/schema.ts
 *
 * Drizzle schema for DispatchDeck — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off carriers.id. Implement first, run
 * `npm run db:generate && npm run db:migrate`, keep in sync with the
 * Data Model section.
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

export const carriers = pgTable("carriers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  mcNumber: text("mc_number"),
  dotNumber: text("dot_number"),
  plan: text("plan", { enum: ["trial", "solo", "team", "fleet"] }).notNull().default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** jsonb: { detentionFreeHours, detentionRateCents, invoiceTermsDays, factoringProfile } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "dispatcher", "driver"] }).notNull().default("owner"),
    truckId: uuid("truck_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const trucks = pgTable("trucks", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  unitNumber: text("unit_number").notNull(),
  yearMakeModel: text("year_make_model"),
  plate: text("plate"),
  status: text("status", { enum: ["active", "parked"] }).notNull().default("active"),
  ...timestamps,
});

/** The broker book; avg_days_to_pay computed from real payments only. */
export const brokers = pgTable("brokers", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  name: text("name").notNull(),
  mcNumber: text("mc_number"),
  termsDays: integer("terms_days").notNull().default(30),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  avgDaysToPay: integer("avg_days_to_pay"),
  notes: text("notes"),
  ...timestamps,
});

/** The core object: one row per load, booked to paid. */
export const loads = pgTable(
  "loads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    truckId: uuid("truck_id").references(() => trucks.id),
    driverUserId: uuid("driver_user_id").references(() => users.id),
    brokerId: uuid("broker_id").references(() => brokers.id),
    reference: text("reference"),
    status: text("status", {
      enum: [
        "booked",
        "dispatched",
        "at_shipper",
        "in_transit",
        "delivered",
        "invoiced",
        "paid",
        "cancelled",
      ],
    })
      .notNull()
      .default("booked"),
    rateCents: integer("rate_cents").notNull(),
    accessorialsCents: integer("accessorials_cents").notNull().default(0),
    totalMiles: integer("total_miles"),
    deadheadMiles: integer("deadhead_miles"),
    equipment: text("equipment", { enum: ["van", "reefer", "flatbed", "other"] })
      .notNull()
      .default("van"),
    factored: boolean("factored").notNull().default(false),
    factoringStatus: text("factoring_status", { enum: ["submitted", "advanced", "settled"] }),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("loads_carrier_status_idx").on(t.carrierId, t.status)],
);

/** Ordered stops; detention math reads arrived/departed stamps. */
export const stops = pgTable(
  "stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loadId: uuid("load_id").notNull().references(() => loads.id),
    seq: integer("seq").notNull(),
    kind: text("kind", { enum: ["pickup", "delivery"] }).notNull(),
    facility: text("facility"),
    address: text("address"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    departedAt: timestamp("departed_at", { withTimezone: true }),
    appointmentRef: text("appointment_ref"),
    ...timestamps,
  },
  (t) => [uniqueIndex("stops_load_seq_idx").on(t.loadId, t.seq)],
);

export const accessorialLines = pgTable("accessorial_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  loadId: uuid("load_id").notNull().references(() => loads.id),
  kind: text("kind", { enum: ["detention", "lumper", "tonu", "layover", "other"] }).notNull(),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  /** jsonb: { stopId, arrivedAt, departedAt, freeHours, rateCents } */
  evidence: jsonb("evidence").notNull().default({}),
  status: text("status", { enum: ["draft", "billed", "paid", "rejected"] })
    .notNull()
    .default("draft"),
  ...timestamps,
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  loadId: uuid("load_id").references(() => loads.id),
  kind: text("kind", {
    enum: ["rate_con", "bol", "pod_photo", "fuel_receipt", "packet", "other"],
  }).notNull(),
  r2Key: text("r2_key").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  pages: integer("pages"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  ...timestamps,
});

/** Parse output awaiting one-tap confirmation. Never silently wrong. */
export const rateConDrafts = pgTable("rate_con_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  documentId: uuid("document_id").notNull().references(() => documents.id),
  /** jsonb: { broker, brokerMc, rateCents, stops: [...], references: [...] } */
  extracted: jsonb("extracted").notNull().default({}),
  confidence: integer("confidence").notNull().default(0),
  status: text("status", { enum: ["pending", "confirmed", "discarded"] })
    .notNull()
    .default("pending"),
  loadId: uuid("load_id").references(() => loads.id),
  ...timestamps,
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    loadId: uuid("load_id").notNull().references(() => loads.id),
    number: integer("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["draft", "sent", "paid", "void"] })
      .notNull()
      .default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    sentTo: text("sent_to"),
    packetDocumentId: uuid("packet_document_id").references(() => documents.id),
    factoringExportId: uuid("factoring_export_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("invoices_carrier_number_idx").on(t.carrierId, t.number)],
);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  amountCents: integer("amount_cents").notNull(),
  method: text("method", {
    enum: ["ach", "check", "factoring_advance", "factoring_settlement"],
  }).notNull(),
  receivedOn: date("received_on").notNull(),
  note: text("note"),
  ...timestamps,
});

/** Schedule-of-accounts batches for the factor. */
export const factoringExports = pgTable("factoring_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  format: text("format", { enum: ["triumph", "rts", "otr", "generic"] }).notNull(),
  invoiceIds: uuid("invoice_ids").array().notNull(),
  csvR2Key: text("csv_r2_key").notNull(),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

/** IFTA raw entries: miles per jurisdiction. */
export const jurisdictionLegs = pgTable(
  "jurisdiction_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    truckId: uuid("truck_id").notNull().references(() => trucks.id),
    loadId: uuid("load_id").references(() => loads.id),
    state: text("state").notNull(),
    miles: integer("miles").notNull(),
    enteredOn: date("entered_on").notNull(),
    source: text("source", { enum: ["odometer", "manual"] }).notNull().default("manual"),
    ...timestamps,
  },
  (t) => [index("jurisdiction_legs_carrier_date_idx").on(t.carrierId, t.enteredOn)],
);

export const fuelPurchases = pgTable("fuel_purchases", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  truckId: uuid("truck_id").notNull().references(() => trucks.id),
  state: text("state").notNull(),
  gallons: integer("gallons").notNull(),
  amountCents: integer("amount_cents").notNull(),
  purchasedOn: date("purchased_on").notNull(),
  receiptDocumentId: uuid("receipt_document_id").references(() => documents.id),
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
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
