/**
 * Drizzle schema for TenantFile — the data model in ARCHITECTURE.md.
 *
 * Money is **always** integer cents (`*_cents`), never a float and never a
 * numeric the driver might hand back as a string. A landlord audits this ledger
 * against a bank statement; rounding drift is not survivable.
 *
 * Dates that are calendar facts (a rent due date, a lease term) are `date`
 * columns held as `YYYY-MM-DD` strings, so a tenancy that starts on the 1st
 * does not become the 31st of the previous month in another timezone. Instants
 * (sent_at, paid_at) are `timestamptz`.
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

/* ----------------------------------------------------------------- types --- */

export type Plan = "keys" | "building" | "portfolio";
export type UserRole = "owner" | "collaborator";
export type PropertyType = "single" | "multi";
export type UnitStatus = "vacant" | "listed" | "occupied";
export type ListingStatus = "draft" | "live" | "closed";

export type ApplicationStatus =
  | "new"
  | "invited_to_screen"
  | "screened"
  | "approved"
  | "declined";

/**
 * Screening is record-keeping only — see src/lib/screening.ts. No provider is
 * integrated and TenantFile never produces a score or a decision, so there is
 * deliberately no "clear"/"flagged" state here: `received` means the landlord
 * recorded that the consumer reporting agency delivered a report to them.
 */
export type ScreeningStatus =
  | "invited"
  | "consented"
  | "awaiting_provider"
  | "received"
  | "expired"
  | "canceled";

export type TenancyStatus = "draft" | "active" | "ended";
export type LeaseStatus = "draft" | "sent" | "partially_signed" | "signed" | "voided";
export type LeaseSource = "upload" | "state_template";
export type SignerRole = "landlord" | "tenant";

export type ChargeKind = "rent" | "late_fee" | "deposit" | "other";
export type ChargeStatus = "upcoming" | "due" | "partial" | "paid" | "waived";

export type PaymentMethod =
  | "ach"
  | "card"
  | "manual_zelle"
  | "manual_cash"
  | "manual_check";

/**
 * ACH does not settle at authorization. Only `succeeded` payments count toward
 * the ledger balance; `processing` is shown to both sides as in-flight, so the
 * tenant sees that their payment landed and the landlord is never told they were
 * paid before the money exists.
 */
export type PaymentStatus = "processing" | "succeeded" | "failed";

export type LateFeeKind = "flat" | "percent";

export type RequestStatus = "open" | "scheduled" | "done" | "closed";
export type RequestPriority = "routine" | "urgent" | "emergency";
export type Party = "tenant" | "landlord";

export type FileEventKind =
  | "application"
  | "screening"
  | "lease"
  | "charge"
  | "payment"
  | "reminder"
  | "request"
  | "note";

export type ReminderTemplate = "upcoming" | "due" | "late_1" | "late_2";
export type ReminderChannel = "email" | "sms";
export type ReminderStatus = "scheduled" | "sent" | "canceled" | "failed";

/**
 * The standard rental application. Deliberately contains no question touching a
 * protected class — see the fair-housing note in src/lib/applications.ts.
 */
export interface ApplicationAnswers {
  currentAddress: string;
  moveInOn: string;
  occupants: number;
  employer: string;
  jobTitle: string;
  monthlyIncomeCents: number;
  employmentYears: number;
  previousLandlordName: string;
  previousLandlordPhone: string;
  pets: string;
  vehicles: string;
  smoker: boolean;
  notes: string;
}

export interface ListingRequirements {
  minIncomeMultiple: number;
  depositCents: number;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  availableOn: string;
  leaseMonths: number;
}

export interface LandlordSettings {
  reminderUpcomingDays: number;
  reminderLateDays: number;
  cardFeePassthrough: boolean;
  rentDueDay: number;
}

export const DEFAULT_SETTINGS: LandlordSettings = {
  reminderUpcomingDays: 3,
  reminderLateDays: 1,
  cardFeePassthrough: true,
  rentDueDay: 1,
};

/** One signature line on a lease, with the evidence that it happened. */
export interface LeaseSignature {
  role: SignerRole;
  name: string;
  typedName: string;
  email: string;
  signedAt: string;
  ip: string;
  userAgent: string;
  consent: string;
}

export interface LeaseFields {
  propertyAddress: string;
  unitLabel: string;
  tenantNames: string[];
  landlordName: string;
  rentCents: number;
  depositCents: number;
  startsOn: string;
  endsOn: string | null;
  rentDueDay: number;
  lateFeeSummary: string;
  /** Present when source = "upload": the landlord's own lease document. */
  uploadKey?: string;
  uploadFilename?: string;
  uploadSha256?: string;
}

/* ------------------------------------------------------- account & people --- */

export const landlords = pgTable("landlords", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").$type<Plan>().notNull().default("keys"),
  /** Our own subscription billing. */
  stripeCustomerId: text("stripe_customer_id"),
  /** Rent collection: the landlord's own connected account. Rent never touches ours. */
  stripeAccountId: text("stripe_account_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  settings: jsonb("settings").$type<LandlordSettings>().notNull().default(DEFAULT_SETTINGS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  landlordId: uuid("landlord_id")
    .notNull()
    .references(() => landlords.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull().default("owner"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------ property inventory --- */

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    landlordId: uuid("landlord_id")
      .notNull()
      .references(() => landlords.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    city: text("city").notNull().default(""),
    /** Two-letter code. Drives the late-fee guardrails (src/lib/state-rules.ts). */
    state: text("state").notNull().default(""),
    postalCode: text("postal_code").notNull().default(""),
    type: text("type").$type<PropertyType>().notNull().default("single"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("properties_landlord_idx").on(t.landlordId)],
);

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    beds: integer("beds").notNull().default(1),
    baths: integer("baths").notNull().default(1),
    sqft: integer("sqft"),
    rentCents: integer("rent_cents").notNull().default(0),
    depositCents: integer("deposit_cents").notNull().default(0),
    status: text("status").$type<UnitStatus>().notNull().default("vacant"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("units_property_idx").on(t.propertyId)],
);

/* ---------------------------------------------------------------- leasing --- */

export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    headline: text("headline").notNull(),
    description: text("description").notNull().default(""),
    photoKeys: text("photo_keys").array().notNull().default([]),
    requirements: jsonb("requirements").$type<ListingRequirements>().notNull(),
    status: text("status").$type<ListingStatus>().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("listings_unit_idx").on(t.unitId)],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    applicantName: text("applicant_name").notNull(),
    applicantEmail: text("applicant_email").notNull(),
    applicantPhone: text("applicant_phone").notNull().default(""),
    answers: jsonb("answers").$type<ApplicationAnswers>().notNull(),
    documentKeys: text("document_keys").array().notNull().default([]),
    status: text("status").$type<ApplicationStatus>().notNull().default("new"),
    declineReason: text("decline_reason"),
    adverseActionSentAt: timestamp("adverse_action_sent_at", { withTimezone: true }),
    adverseActionBody: text("adverse_action_body"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("applications_listing_idx").on(t.listingId, t.status)],
);

/**
 * Screening record-keeping. `landlordNote` holds only what the LANDLORD typed in
 * from the report they received (agency name, reference, date). TenantFile stores
 * no report contents, computes no score, and makes no recommendation.
 */
export const screeningReports = pgTable(
  "screening_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    /** Consumer reporting agency the landlord uses. Free text — we integrate none. */
    provider: text("provider").notNull().default(""),
    providerRef: text("provider_ref"),
    status: text("status").$type<ScreeningStatus>().notNull().default("invited"),
    /** FCRA §604(b)/§606: the applicant's written authorization, with evidence. */
    consentAt: timestamp("consent_at", { withTimezone: true }),
    consentIp: text("consent_ip"),
    consentName: text("consent_name"),
    receivedOn: date("received_on"),
    expiresOn: date("expires_on"),
    /** Landlord's own note about the report. Never parsed, never scored. */
    landlordNote: text("landlord_note").notNull().default(""),
    paidByApplicant: boolean("paid_by_applicant").notNull().default(true),
    inviteToken: text("invite_token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("screening_application_idx").on(t.applicationId)],
);

/* ------------------------------------------------------- tenancy (spine) --- */

export const tenancies = pgTable(
  "tenancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    tenantNames: text("tenant_names").array().notNull().default([]),
    tenantEmails: text("tenant_emails").array().notNull().default([]),
    tenantPhones: text("tenant_phones").array().notNull().default([]),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    rentCents: integer("rent_cents").notNull(),
    depositCents: integer("deposit_cents").notNull().default(0),
    rentDueDay: integer("rent_due_day").notNull().default(1),
    /** Charge the first month pro rata when the term does not start on the due day. */
    prorateFirstMonth: boolean("prorate_first_month").notNull().default(true),
    prorateLastMonth: boolean("prorate_last_month").notNull().default(true),
    status: text("status").$type<TenancyStatus>().notNull().default("draft"),
    /** Signed link for the tenant pay/status page. No tenant account in MVP. */
    portalToken: text("portal_token").notNull().unique(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tenancies_unit_idx").on(t.unitId, t.status)],
);

export const leases = pgTable(
  "leases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "cascade" }),
    source: text("source").$type<LeaseSource>().notNull().default("state_template"),
    /** Adapter's envelope id. The built-in adapter uses the lease's own id. */
    providerEnvelopeId: text("provider_envelope_id"),
    provider: text("provider").notNull().default("builtin"),
    status: text("status").$type<LeaseStatus>().notNull().default("draft"),
    fields: jsonb("fields").$type<LeaseFields>().notNull(),
    signatures: jsonb("signatures").$type<LeaseSignature[]>().notNull().default([]),
    /** Sealed PDF (lease + audit certificate) in object storage. */
    signedPdfKey: text("signed_pdf_key"),
    /** Signing links: one token per signer, so the audit shows who used what. */
    landlordToken: text("landlord_token").notNull(),
    tenantToken: text("tenant_token").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("leases_tenancy_idx").on(t.tenancyId)],
);

/* ----------------------------------------------------------------- money --- */

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ChargeKind>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueOn: date("due_on").notNull(),
    /** "YYYY-MM" for rent; null for deposit and one-off charges. */
    period: text("period"),
    status: text("status").$type<ChargeStatus>().notNull().default("upcoming"),
    memo: text("memo").notNull().default(""),
    /** Set on a late_fee charge: the rent charge it was assessed against. */
    sourceChargeId: uuid("source_charge_id"),
    prorated: boolean("prorated").notNull().default(false),
    /** True once a human edited the amount — the generator must not overwrite it. */
    manuallyAdjusted: boolean("manually_adjusted").notNull().default(false),
    waivedAt: timestamp("waived_at", { withTimezone: true }),
    waivedReason: text("waived_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // No double rent, ever: one rent charge per tenancy per period.
    uniqueIndex("charges_rent_period_uniq")
      .on(t.tenancyId, t.period)
      .where(sql`kind = 'rent'`),
    // One late fee per rent charge.
    uniqueIndex("charges_late_fee_source_uniq")
      .on(t.sourceChargeId)
      .where(sql`kind = 'late_fee'`),
    index("charges_due_idx").on(t.status, t.dueOn),
    index("charges_tenancy_idx").on(t.tenancyId, t.dueOn),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "cascade" }),
    /** Null = unapplied credit; the ledger allocates it oldest-charge-first. */
    chargeId: uuid("charge_id").references(() => charges.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("succeeded"),
    reference: text("reference").notNull().default(""),
    stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
    /** Fee the tenant covered when paying by card (pass-through), in cents. */
    feeCents: integer("fee_cents").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: text("recorded_by").$type<Party>().notNull().default("landlord"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payments_tenancy_idx").on(t.tenancyId, t.paidAt)],
);

export const lateFeeRules = pgTable("late_fee_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenancyId: uuid("tenancy_id")
    .notNull()
    .references(() => tenancies.id, { onDelete: "cascade" })
    .unique(),
  graceDays: integer("grace_days").notNull().default(5),
  kind: text("kind").$type<LateFeeKind>().notNull().default("flat"),
  /** flat: cents. percent: basis points of the unpaid rent (500 = 5%). */
  amount: integer("amount").notNull().default(5000),
  maxPerMonthCents: integer("max_per_month_cents"),
  /** The landlord acknowledged the state guidance shown at setup. */
  stateCapAck: boolean("state_cap_ack").notNull().default(false),
  stateCapNote: text("state_cap_note").notNull().default(""),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------- maintenance --- */

export const maintenanceRequests = pgTable(
  "maintenance_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").$type<RequestStatus>().notNull().default("open"),
    priority: text("priority").$type<RequestPriority>().notNull().default("routine"),
    costCents: integer("cost_cents"),
    scheduledFor: date("scheduled_for"),
    openedBy: text("opened_by").$type<Party>().notNull(),
    /** Which side has unread messages, for the thread dot in DESIGN.md. */
    landlordUnread: integer("landlord_unread").notNull().default(0),
    tenantUnread: integer("tenant_unread").notNull().default(0),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("requests_tenancy_idx").on(t.tenancyId, t.status)],
);

export const requestMessages = pgTable(
  "request_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => maintenanceRequests.id, { onDelete: "cascade" }),
    author: text("author").$type<Party>().notNull(),
    body: text("body").notNull(),
    photoKeys: text("photo_keys").array().notNull().default([]),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_messages_idx").on(t.requestId, t.sentAt)],
);

/* --------------------------------------------------------------- the File --- */

/**
 * Append-only. Nothing in this codebase updates or deletes a file_event: the
 * whole value proposition is that the record still says what it said on the day
 * it happened. Corrections are new events.
 */
export const fileEvents = pgTable(
  "file_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FileEventKind>().notNull(),
    refId: uuid("ref_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    summary: text("summary").notNull(),
    detail: text("detail").notNull().default(""),
    amountCents: integer("amount_cents"),
    /** Set for repeatable events so a replayed job cannot duplicate a line. */
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("file_events_tenancy_idx").on(t.tenancyId, t.occurredAt),
    uniqueIndex("file_events_dedupe_uniq").on(t.tenancyId, t.dedupeKey),
  ],
);

/* -------------------------------------------------------------- reminders --- */

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chargeId: uuid("charge_id")
      .notNull()
      .references(() => charges.id, { onDelete: "cascade" }),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id, { onDelete: "cascade" }),
    channel: text("channel").$type<ReminderChannel>().notNull(),
    template: text("template").$type<ReminderTemplate>().notNull(),
    sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
    status: text("status").$type<ReminderStatus>().notNull().default("scheduled"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reminders_due_idx").on(t.status, t.sendAt),
    uniqueIndex("reminders_charge_uniq").on(t.chargeId, t.template, t.channel),
  ],
);

/* -------------------------------------------------------------- audit log --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    landlordId: uuid("landlord_id")
      .notNull()
      .references(() => landlords.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull().default(""),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_landlord_idx").on(t.landlordId, t.createdAt)],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  landlordId: uuid("landlord_id")
    .notNull()
    .references(() => landlords.id, { onDelete: "cascade" })
    .unique(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  plan: text("plan").$type<Plan>().notNull().default("keys"),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Stripe events already processed — webhook replay tolerance. */
export const processedEvents = pgTable("processed_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- row types --- */

export type Landlord = typeof landlords.$inferSelect;
export type User = typeof users.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type ScreeningReport = typeof screeningReports.$inferSelect;
export type Tenancy = typeof tenancies.$inferSelect;
export type Lease = typeof leases.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type LateFeeRule = typeof lateFeeRules.$inferSelect;
export type MaintenanceRequest = typeof maintenanceRequests.$inferSelect;
export type RequestMessage = typeof requestMessages.$inferSelect;
export type FileEvent = typeof fileEvents.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
