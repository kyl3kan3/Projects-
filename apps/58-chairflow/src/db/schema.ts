/**
 * src/db/schema.ts
 *
 * Drizzle schema for ChairFlow — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off stylists.id; shop tables hang off
 * shops.id. Policies are append-only versions; every appointment stores
 * the version it was booked under (that stamp wins disputes).
 *
 * Implement this first, run `npm run db:generate && npm run db:migrate`,
 * and keep every column in sync with ARCHITECTURE.md's Data Model.
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

/** Logins: stylists and shop owners. Auth.js tables live alongside. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Shop tier tenant. */
export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address"),
  stripeCustomerId: text("stripe_customer_id"),
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

/** Tenant root. handle is the public booking URL: /b/[handle]. */
export const stylists = pgTable("stylists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  trade: text("trade", { enum: ["stylist", "barber", "esthetician", "nails"] })
    .notNull()
    .default("stylist"),
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: text("plan", { enum: ["trial", "chair", "book", "shop_member"] })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  /** The stylist's own Stripe Connect Express account — client money lands here. */
  stripeAccountId: text("stripe_account_id"),
  connectStatus: text("connect_status", { enum: ["pending", "active"] })
    .notNull()
    .default("pending"),
  shopId: uuid("shop_id").references(() => shops.id),
  /** jsonb: per-weekday { start: "09:00", end: "18:00", off: boolean } */
  workingHours: jsonb("working_hours").notNull().default({}),
  /** jsonb: reminder offsets, quiet hours, nudge grace days */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const chairs = pgTable("chairs", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  label: text("label").notNull(),
  stylistId: uuid("stylist_id").references(() => stylists.id),
  weeklyRentCents: integer("weekly_rent_cents").notNull().default(0),
  status: text("status", { enum: ["occupied", "vacant"] }).notNull().default("vacant"),
  ...timestamps,
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
  name: text("name").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  /** jsonb: { kind: "none" | "flat_cents" | "percent", value?: number } */
  depositRule: jsonb("deposit_rule").notNull().default({ kind: "none" }),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  ...timestamps,
});

/** Append-only versioned fee policy; editing creates version N+1. */
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
    version: integer("version").notNull(),
    cancelWindowHours: integer("cancel_window_hours").notNull().default(24),
    lateCancelFeePercent: integer("late_cancel_fee_percent").notNull().default(25),
    noShowFeePercent: integer("no_show_fee_percent").notNull().default(50),
    /** Rendered verbatim on the booking page's policy panel. */
    policyText: text("policy_text").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("policies_stylist_version_idx").on(t.stylistId, t.version)],
);

/** The stylist's book — never a marketplace identity. No client accounts. */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    phone: text("phone").notNull(),
    email: text("email"),
    smsConsent: boolean("sms_consent").notNull().default(false),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    /** Customer on the STYLIST'S Connect account, not the platform. */
    stripeCustomerId: text("stripe_customer_id"),
    defaultPaymentMethodId: text("default_payment_method_id"),
    notes: text("notes"),
    noShowCount: integer("no_show_count").notNull().default(0),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("clients_stylist_phone_idx").on(t.stylistId, t.phone)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    priceCents: integer("price_cents").notNull(),
    status: text("status", {
      enum: ["booked", "completed", "no_show", "late_cancelled", "cancelled", "rescheduled"],
    })
      .notNull()
      .default("booked"),
    /** The stamps that win disputes. */
    policyVersion: integer("policy_version").notNull(),
    policyAgreedAt: timestamp("policy_agreed_at", { withTimezone: true }).notNull(),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositCents: integer("deposit_cents").notNull().default(0),
    manageTokenHash: text("manage_token_hash").notNull(),
    source: text("source", { enum: ["booking_page", "manual", "nudge", "waitlist"] })
      .notNull()
      .default("booking_page"),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    markedBy: text("marked_by"),
    ...timestamps,
  },
  (t) => [index("appointments_stylist_starts_idx").on(t.stylistId, t.startsAt)],
);

/** The protection ledger's rows. */
export const charges = pgTable("charges", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointments.id),
  kind: text("kind", { enum: ["deposit", "no_show_fee", "late_cancel_fee", "refund"] }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  status: text("status", {
    enum: ["held", "captured", "charged", "waived", "refunded", "failed", "disputed"],
  }).notNull(),
  policyVersion: integer("policy_version").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  waivedBy: uuid("waived_by").references(() => users.id),
  failureReason: text("failure_reason"),
  ...timestamps,
});

/** Per client x service rhythm; recomputed nightly. */
export const cadences = pgTable(
  "cadences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    serviceId: uuid("service_id").notNull().references(() => services.id),
    medianIntervalDays: integer("median_interval_days").notNull(),
    sampleCount: integer("sample_count").notNull(),
    lastVisitOn: date("last_visit_on").notNull(),
    nextDueOn: date("next_due_on").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cadences_client_service_idx").on(t.clientId, t.serviceId)],
);

/** Rebooking touches; receipts, not claims. */
export const nudges = pgTable("nudges", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  cadenceId: uuid("cadence_id").notNull().references(() => cadences.id),
  channel: text("channel", { enum: ["sms", "email"] }).notNull(),
  status: text("status", {
    enum: ["queued", "sent", "delivered", "failed", "opted_out", "booked"],
  })
    .notNull()
    .default("queued"),
  cycleCount: integer("cycle_count").notNull().default(1),
  bookingTokenHash: text("booking_token_hash"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  resultedAppointmentId: uuid("resulted_appointment_id").references(() => appointments.id),
  ...timestamps,
});

export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  serviceId: uuid("service_id").notNull().references(() => services.id),
  /** jsonb: { days: number[], timeOfDay?: "morning" | "afternoon" | "evening" } */
  dayPreference: jsonb("day_preference").notNull().default({}),
  status: text("status", { enum: ["waiting", "offered", "claimed", "expired"] })
    .notNull()
    .default("waiting"),
  offeredAppointmentSlot: jsonb("offered_appointment_slot"),
  offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
  ...timestamps,
});

/** The chair-rent split ledger (Shop tier). */
export const rentPeriods = pgTable(
  "rent_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chairId: uuid("chair_id").notNull().references(() => chairs.id),
    stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
    weekStartOn: date("week_start_on").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: text("status", { enum: ["due", "paid", "late", "waived"] }).notNull().default("due"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    stripePaymentLinkId: text("stripe_payment_link_id"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("rent_periods_chair_week_idx").on(t.chairId, t.weekStartOn)],
);

/** Every outbound comm, with provider delivery status. */
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  stylistId: uuid("stylist_id").notNull().references(() => stylists.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  appointmentId: uuid("appointment_id").references(() => appointments.id),
  kind: text("kind", {
    enum: ["confirmation", "reminder_48h", "reminder_2h", "nudge", "waitlist_offer", "receipt"],
  }).notNull(),
  channel: text("channel", { enum: ["sms", "email"] }).notNull(),
  providerMessageId: text("provider_message_id"),
  status: text("status", {
    enum: ["queued", "sent", "delivered", "failed", "opted_out"],
  })
    .notNull()
    .default("queued"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Provider idempotency ledger (stripe platform + connect, twilio). */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", { enum: ["stripe", "twilio"] }).notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_provider_external_idx").on(t.provider, t.externalId)],
);

/** Fee charges, waives, policy edits, and rent changes always logged. */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  stylistId: uuid("stylist_id").references(() => stylists.id),
  shopId: uuid("shop_id").references(() => shops.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
