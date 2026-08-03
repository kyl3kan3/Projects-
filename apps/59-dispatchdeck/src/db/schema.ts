/**
 * src/db/schema.ts
 *
 * Drizzle schema for DispatchDeck — the data model from ARCHITECTURE.md.
 * Multi-tenant off carriers.id.
 *
 * Four deliberate refinements on the scaffold's draft, each noted at the
 * table it touches:
 *  - `carriers.slug`, so the inbound parse address (loads+{slug}@…) can be
 *    resolved back to a tenant.
 *  - `accessorial_lines.stop_id` as a real column plus a unique index, so the
 *    detention sweep can only ever draft one line per stop no matter how many
 *    times it runs. A jsonb key cannot carry that guarantee.
 *  - `fuel_purchases.gallons_milli`: gallons are fractional and money maths
 *    never touches a float, so gallons are stored as thousandths, exactly the
 *    discipline cents get.
 *  - jsonb columns carry `$type`, so `settings` and `extracted` are typed at
 *    every read instead of being `unknown` everywhere.
 */

import { sql } from "drizzle-orm";
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

/** Carrier settings, stored as jsonb so adding a knob needs no migration. */
export interface CarrierSettings {
  /** Free hours at a stop before detention starts accruing. */
  detentionFreeHours?: number;
  /** Detention rate per hour, in cents. */
  detentionRateCents?: number;
  /** Days the carrier's own invoices are due in, when the broker has no terms. */
  invoiceTermsDays?: number;
  /** Dispatch service fee, in basis points of linehaul (500 = 5%). */
  dispatchFeeBps?: number;
  factoringCompany?: string;
  factoringFormat?: "triumph" | "rts" | "otr" | "generic";
  /** Advance rate the factor pays up front, in basis points (9700 = 97%). */
  factoringAdvanceBps?: number;
  /** Stripe subscription status, mirrored from webhooks. */
  subscriptionStatus?: string;
  /** When dunning started, ISO date — grace before read-only. */
  pastDueSince?: string;
  remitToAddress?: string;
}

export const carriers = pgTable(
  "carriers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Local part of the inbound parse address: loads+{slug}@… */
    slug: text("slug").notNull(),
    mcNumber: text("mc_number"),
    dotNumber: text("dot_number"),
    plan: text("plan", { enum: ["trial", "solo", "team", "fleet"] }).notNull().default("trial"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("America/Chicago"),
    settings: jsonb("settings").$type<CarrierSettings>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("carriers_slug_idx").on(t.slug)],
);

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
  /** How many paid invoices avg_days_to_pay was computed from. */
  paidInvoiceCount: integer("paid_invoice_count").notNull().default(0),
  notes: text("notes"),
  ...timestamps,
});

export const LOAD_STATUSES = [
  "booked",
  "dispatched",
  "at_shipper",
  "in_transit",
  "delivered",
  "invoiced",
  "paid",
  "cancelled",
] as const;

export type LoadStatus = (typeof LOAD_STATUSES)[number];

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
    status: text("status", { enum: LOAD_STATUSES }).notNull().default("booked"),
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
    loadId: uuid("load_id").notNull().references(() => loads.id, { onDelete: "cascade" }),
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

/** Evidence attached to a drafted accessorial — what the broker gets shown. */
export interface AccessorialEvidence {
  stopId?: string;
  facility?: string;
  arrivedAt?: string;
  departedAt?: string;
  freeHours?: number;
  rateCents?: number;
  billableHours?: number;
  /** True while the stop is still open and the amount can still grow. */
  accruing?: boolean;
}

export const accessorialLines = pgTable(
  "accessorial_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    loadId: uuid("load_id").notNull().references(() => loads.id, { onDelete: "cascade" }),
    /**
     * Set for detention only. The unique index below is what stops the
     * five-minute sweep from drafting the same line for eternity — Postgres
     * treats NULLs as distinct, so lumper/TONU/layover lines are unaffected.
     */
    stopId: uuid("stop_id").references(() => stops.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["detention", "lumper", "tonu", "layover", "other"] }).notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    evidence: jsonb("evidence").$type<AccessorialEvidence>().notNull().default({}),
    status: text("status", { enum: ["draft", "billed", "paid", "rejected"] })
      .notNull()
      .default("draft"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("accessorial_lines_stop_kind_idx").on(t.stopId, t.kind),
    index("accessorial_lines_load_idx").on(t.loadId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    loadId: uuid("load_id").references(() => loads.id, { onDelete: "set null" }),
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
  },
  (t) => [index("documents_load_kind_idx").on(t.loadId, t.kind)],
);

/** What the extractor claims it read off the rate confirmation. */
export interface ExtractedRateCon {
  broker?: string | null;
  brokerMc?: string | null;
  rateCents?: number | null;
  references?: string[];
  totalMiles?: number | null;
  equipment?: "van" | "reefer" | "flatbed" | "other" | null;
  stops?: Array<{
    kind: "pickup" | "delivery";
    facility?: string | null;
    city: string;
    state: string;
    windowStart?: string | null;
    windowEnd?: string | null;
  }>;
  /** Per-field 0–100; anything under 80 gets a hazard underline in review. */
  fieldConfidence?: Record<string, number>;
  /** Set when nothing could be read — the review screen says so plainly. */
  failureReason?: string | null;
  source?: "claude" | "heuristic";
}

/** Parse output awaiting one-tap confirmation. Never silently wrong. */
export const rateConDrafts = pgTable(
  "rate_con_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    documentId: uuid("document_id").notNull().references(() => documents.id),
    extracted: jsonb("extracted").$type<ExtractedRateCon>().notNull().default({}),
    confidence: integer("confidence").notNull().default(0),
    status: text("status", { enum: ["pending", "confirmed", "discarded"] })
      .notNull()
      .default("pending"),
    loadId: uuid("load_id").references(() => loads.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("rate_con_drafts_document_idx").on(t.documentId),
    index("rate_con_drafts_carrier_status_idx").on(t.carrierId, t.status),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    loadId: uuid("load_id").notNull().references(() => loads.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["draft", "sent", "paid", "void"] })
      .notNull()
      .default("draft"),
    /** Terms captured at send time, so a later edit to the broker book cannot rewrite history. */
    termsDays: integer("terms_days").notNull().default(30),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    sentTo: text("sent_to"),
    packetDocumentId: uuid("packet_document_id").references(() => documents.id),
    factoringExportId: uuid("factoring_export_id"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_carrier_number_idx").on(t.carrierId, t.number),
    uniqueIndex("invoices_load_idx").on(t.loadId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method", {
      enum: ["ach", "check", "factoring_advance", "factoring_settlement"],
    }).notNull(),
    receivedOn: date("received_on").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("payments_invoice_idx").on(t.invoiceId)],
);

/** Schedule-of-accounts batches for the factor. */
export const factoringExports = pgTable("factoring_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
  format: text("format", { enum: ["triumph", "rts", "otr", "generic"] }).notNull(),
  invoiceIds: uuid("invoice_ids").array().notNull(),
  csvR2Key: text("csv_r2_key").notNull(),
  totalCents: integer("total_cents").notNull().default(0),
  exportedAt: timestamp("exported_at", { withTimezone: true }).notNull().defaultNow(),
});

/** IFTA raw entries: miles per jurisdiction. */
export const jurisdictionLegs = pgTable(
  "jurisdiction_legs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    truckId: uuid("truck_id").notNull().references(() => trucks.id),
    loadId: uuid("load_id").references(() => loads.id, { onDelete: "set null" }),
    state: text("state").notNull(),
    miles: integer("miles").notNull(),
    enteredOn: date("entered_on").notNull(),
    source: text("source", { enum: ["odometer", "manual"] }).notNull().default("manual"),
    ...timestamps,
  },
  (t) => [index("jurisdiction_legs_carrier_date_idx").on(t.carrierId, t.enteredOn)],
);

export const fuelPurchases = pgTable(
  "fuel_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    truckId: uuid("truck_id").notNull().references(() => trucks.id),
    state: text("state").notNull(),
    /** Thousandths of a gallon. 112.482 gal is stored as 112482. */
    gallonsMilli: integer("gallons_milli").notNull(),
    amountCents: integer("amount_cents").notNull(),
    purchasedOn: date("purchased_on").notNull(),
    receiptDocumentId: uuid("receipt_document_id").references(() => documents.id),
    ...timestamps,
  },
  (t) => [index("fuel_purchases_carrier_date_idx").on(t.carrierId, t.purchasedOn)],
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
    carrierId: uuid("carrier_id").notNull().references(() => carriers.id),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (t) => [index("audit_log_carrier_idx").on(t.carrierId, sql`${t.createdAt} desc`)],
);

export type Carrier = typeof carriers.$inferSelect;
export type User = typeof users.$inferSelect;
export type Truck = typeof trucks.$inferSelect;
export type Broker = typeof brokers.$inferSelect;
export type Load = typeof loads.$inferSelect;
export type Stop = typeof stops.$inferSelect;
export type AccessorialLine = typeof accessorialLines.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type RateConDraft = typeof rateConDrafts.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type FactoringExport = typeof factoringExports.$inferSelect;
export type JurisdictionLeg = typeof jurisdictionLegs.$inferSelect;
export type FuelPurchase = typeof fuelPurchases.$inferSelect;
