/**
 * src/db/schema.ts
 *
 * Drizzle schema for ChairFlow — ARCHITECTURE.md's data model, with four
 * deliberate departures, each recorded where it happens:
 *
 *  1. **Money is `bigint` in minor units, not `integer`.** A currency total in
 *     int4 stops at $21.4M and throws `22003 out of range` on the first
 *     unusually large number; the range costs nothing here.
 *  2. **`users` carries a scrypt password hash.** The portfolio's auth
 *     convention is scrypt + a signed JWT session cookie (jose), not Auth.js's
 *     adapter tables, so there is no `accounts` / `sessions` / `verification`
 *     trio.
 *  3. **`late` is never stored on a rent period, and no appointment carries a
 *     `flagged` column.** Both are functions of the clock, and a status column a
 *     sweep is supposed to reconcile renders stale between sweeps ("Due" on a
 *     rent week two months old). They are derived as-of-now for display; see
 *     `lib/rent.ts` and `lib/appointments.ts`.
 *  4. **`job_leases`** exists because ChairFlow's background work runs in two
 *     shapes — a `CRON_SECRET`-gated route on Vercel and a long-lived
 *     `npm run worker` elsewhere — and a lease row is what stops the two from
 *     doing the same send twice.
 *
 * Multi-tenancy: everything hangs off `stylists.id`; shop tables off `shops.id`.
 * Policies are append-only versions and every appointment stores the version it
 * was booked under — that stamp is what wins a dispute.
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

/** Money in minor units. bigint, because int4 tops out at $21.4M. */
const cents = (name: string) => bigint(name, { mode: "number" });

/** Logins: stylists and shop owners. Clients never have accounts. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** scrypt: `<salt hex>:<derived hex>`. See lib/auth.ts. */
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Shop tier tenant. */
export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address"),
  timezone: text("timezone").notNull().default("America/New_York"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

/** Tenant root. `handle` is the public booking URL: /b/[handle]. */
export const stylists = pgTable("stylists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  handle: text("handle").notNull().unique(),
  displayName: text("display_name").notNull(),
  trade: text("trade", { enum: ["stylist", "barber", "esthetician", "nails"] })
    .notNull()
    .default("stylist"),
  /** Where the chair is: "Foundry Barber Co, 118 Mill St, Providence RI". */
  chairLocation: text("chair_location"),
  bio: text("bio"),
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: text("plan", { enum: ["chair", "book", "shop_member"] })
    .notNull()
    .default("chair"),
  /** ChairFlow's own billing (platform account). */
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Stripe's own subscription status string; null while on trial. */
  subscriptionStatus: text("subscription_status"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** The stylist's own Stripe Connect Express account — client money lands here. */
  stripeAccountId: text("stripe_account_id"),
  connectStatus: text("connect_status", { enum: ["pending", "active"] })
    .notNull()
    .default("pending"),
  shopId: uuid("shop_id").references(() => shops.id),
  /** jsonb WorkingHours: per weekday { open: "09:00", close: "18:00", off } */
  workingHours: jsonb("working_hours").notNull().default({}),
  /** jsonb StylistSettings: reminder offsets, quiet hours, nudge grace days. */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const chairs = pgTable(
  "chairs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id),
    label: text("label").notNull(),
    stylistId: uuid("stylist_id").references(() => stylists.id),
    weeklyRentCents: cents("weekly_rent_cents").notNull().default(0),
    status: text("status", { enum: ["occupied", "vacant"] })
      .notNull()
      .default("vacant"),
    ...timestamps,
  },
  (t) => [index("chairs_shop_idx").on(t.shopId)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    name: text("name").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    priceCents: cents("price_cents").notNull(),
    /** jsonb DepositRule: { kind: "none" } | { kind: "flat", cents } | { kind: "percent", percent } */
    depositRule: jsonb("deposit_rule").notNull().default({ kind: "none" }),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (t) => [index("services_stylist_idx").on(t.stylistId)],
);

/** Append-only versioned fee policy; editing creates version N+1. */
export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
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
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    /** E.164. Unique per stylist — the client's identity in this book. */
    phone: text("phone").notNull(),
    email: text("email"),
    smsConsent: boolean("sms_consent").notNull().default(false),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    /** Customer on the STYLIST'S Connect account, never on the platform. */
    stripeCustomerId: text("stripe_customer_id"),
    defaultPaymentMethodId: text("default_payment_method_id"),
    /** Last four of the card on file, for the stylist's screen only. */
    cardLast4: text("card_last4"),
    notes: text("notes"),
    noShowCount: integer("no_show_count").notNull().default(0),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("clients_stylist_phone_idx").on(t.stylistId, t.phone)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    priceCents: cents("price_cents").notNull(),
    status: text("status", {
      enum: ["booked", "completed", "no_show", "late_cancelled", "cancelled", "rescheduled"],
    })
      .notNull()
      .default("booked"),
    /** The stamps that win disputes. */
    policyVersion: integer("policy_version").notNull(),
    policyAgreedAt: timestamp("policy_agreed_at", { withTimezone: true }).notNull(),
    depositPaymentIntentId: text("deposit_payment_intent_id"),
    depositCents: cents("deposit_cents").notNull().default(0),
    manageTokenHash: text("manage_token_hash").notNull(),
    source: text("source", { enum: ["booking_page", "manual", "nudge", "waitlist"] })
      .notNull()
      .default("booking_page"),
    markedAt: timestamp("marked_at", { withTimezone: true }),
    markedBy: text("marked_by"),
    ...timestamps,
  },
  (t) => [
    index("appointments_stylist_starts_idx").on(t.stylistId, t.startsAt),
    index("appointments_client_idx").on(t.clientId),
    index("appointments_status_starts_idx").on(t.status, t.startsAt),
  ],
);

/** The protection ledger's rows. */
export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id),
    kind: text("kind", {
      enum: ["deposit", "no_show_fee", "late_cancel_fee", "refund"],
    }).notNull(),
    amountCents: cents("amount_cents").notNull(),
    /** How much of `amountCents` came out of the deposit already held. */
    depositAppliedCents: cents("deposit_applied_cents").notNull().default(0),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    status: text("status", {
      enum: ["held", "captured", "charged", "waived", "refunded", "failed", "disputed"],
    }).notNull(),
    policyVersion: integer("policy_version").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    waivedBy: uuid("waived_by").references(() => users.id),
    failureReason: text("failure_reason"),
    /** True when no payment provider was configured and this is a recorded stand-in. */
    simulated: boolean("simulated").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("charges_appointment_idx").on(t.appointmentId),
    /**
     * One fee per appointment per kind, enforced by the database rather than by
     * the caller remembering: `capture-fee` is retried, and a retry that charges
     * a second time is the worst bug this product could have.
     */
    uniqueIndex("charges_appointment_kind_idx").on(t.appointmentId, t.kind),
  ],
);

/** Per client x service rhythm; recomputed by the nightly scan. */
export const cadences = pgTable(
  "cadences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    medianIntervalDays: integer("median_interval_days").notNull(),
    sampleCount: integer("sample_count").notNull(),
    lastVisitOn: date("last_visit_on").notNull(),
    nextDueOn: date("next_due_on").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cadences_client_service_idx").on(t.clientId, t.serviceId)],
);

/**
 * Rebooking touches; receipts, not claims.
 *
 * `cycleKey` is the visit date that opened the current cycle (the cadence's
 * `lastVisitOn` at send time). Caps are counted per cycle, so a client who comes
 * back gets a fresh allowance instead of being permanently silenced — and the
 * unique index makes a retried scan unable to double-send rung N.
 */
export const nudges = pgTable(
  "nudges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    cadenceId: uuid("cadence_id")
      .notNull()
      .references(() => cadences.id),
    cycleKey: date("cycle_key").notNull(),
    channel: text("channel", { enum: ["sms", "email"] }).notNull(),
    status: text("status", {
      enum: ["queued", "sent", "delivered", "failed", "opted_out", "booked"],
    })
      .notNull()
      .default("queued"),
    /** 1 or 2 — the rung within this cycle. Capped at 2 by lib/cadence.ts. */
    cycleCount: integer("cycle_count").notNull().default(1),
    bookingTokenHash: text("booking_token_hash"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    resultedAppointmentId: uuid("resulted_appointment_id").references(() => appointments.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("nudges_cadence_cycle_rung_idx").on(t.cadenceId, t.cycleKey, t.cycleCount),
    index("nudges_client_idx").on(t.clientId),
  ],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    /** jsonb DayPreference: { weekdays: number[], partOfDay?: "morning"|"afternoon"|"evening" } */
    dayPreference: jsonb("day_preference").notNull().default({}),
    status: text("status", { enum: ["waiting", "offered", "claimed", "expired"] })
      .notNull()
      .default("waiting"),
    /** jsonb OfferedSlot: { startsAt: iso, endsAt: iso } */
    offeredAppointmentSlot: jsonb("offered_appointment_slot"),
    offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
    claimTokenHash: text("claim_token_hash"),
    claimedAppointmentId: uuid("claimed_appointment_id").references(() => appointments.id),
    ...timestamps,
  },
  (t) => [index("waitlist_stylist_status_idx").on(t.stylistId, t.status)],
);

/**
 * The chair-rent split ledger (Shop tier).
 *
 * `status` never holds "late": that is `week_start_on + 3 days < today`, which a
 * stored column would only tell the truth about between sweeps. See lib/rent.ts.
 */
export const rentPeriods = pgTable(
  "rent_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id),
    chairId: uuid("chair_id")
      .notNull()
      .references(() => chairs.id),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    weekStartOn: date("week_start_on").notNull(),
    amountCents: cents("amount_cents").notNull(),
    status: text("status", { enum: ["due", "paid", "waived"] })
      .notNull()
      .default("due"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidVia: text("paid_via", { enum: ["link", "manual"] }),
    stripePaymentLinkId: text("stripe_payment_link_id"),
    stripePaymentLinkUrl: text("stripe_payment_link_url"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("rent_periods_chair_week_idx").on(t.chairId, t.weekStartOn)],
);

/** Every outbound comm, with provider delivery status. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id")
      .notNull()
      .references(() => stylists.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    appointmentId: uuid("appointment_id").references(() => appointments.id),
    kind: text("kind", {
      enum: [
        "confirmation",
        "reminder_48h",
        "reminder_2h",
        "nudge",
        "waitlist_offer",
        "receipt",
        "cancellation",
      ],
    }).notNull(),
    channel: text("channel", { enum: ["sms", "email"] }).notNull(),
    body: text("body").notNull().default(""),
    providerMessageId: text("provider_message_id"),
    status: text("status", {
      enum: ["queued", "sent", "delivered", "failed", "opted_out"],
    })
      .notNull()
      .default("queued"),
    failureReason: text("failure_reason"),
    /** True when no sender was configured: recorded, not sent. Shown as such. */
    simulated: boolean("simulated").notNull().default(false),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_stylist_occurred_idx").on(t.stylistId, t.occurredAt),
    /**
     * The reminder ladder's dedupe rung. Postgres treats NULLs as distinct, so
     * nudges and waitlist offers (no appointment yet) are unaffected, while a
     * second 48h reminder for the same appointment simply cannot be written —
     * which is what stops a sweep mailing the same person every time it runs.
     */
    uniqueIndex("messages_appointment_kind_channel_idx").on(
      t.appointmentId,
      t.kind,
      t.channel,
    ),
  ],
);

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

/** Fee charges, waives, policy edits, and rent changes are always logged. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stylistId: uuid("stylist_id").references(() => stylists.id),
    shopId: uuid("shop_id").references(() => shops.id),
    /** "user:<id>" | "system" | "client_token" */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("audit_log_stylist_created_idx").on(t.stylistId, t.createdAt)],
);

/**
 * Scheduled-work leases.
 *
 * The same `runTick` is driven by `/api/cron/tick` on Vercel and by
 * `npm run worker` on a host with real processes. Each job step takes its lease
 * first, so running both at once is safe rather than a double-send.
 *
 * `lockedUntil` is compared **in SQL**, never against a JS `Date`: Postgres keeps
 * microseconds where JS truncates to milliseconds, and a lock whose expiry came
 * from `now()` is otherwise found expired-then-unclaimable forever.
 */
export const jobLeases = pgTable("job_leases", {
  name: text("name").primaryKey(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull().defaultNow(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastReport: jsonb("last_report"),
});

export type User = typeof users.$inferSelect;
export type Shop = typeof shops.$inferSelect;
export type Stylist = typeof stylists.$inferSelect;
export type Chair = typeof chairs.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Policy = typeof policies.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Cadence = typeof cadences.$inferSelect;
export type Nudge = typeof nudges.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
export type RentPeriod = typeof rentPeriods.$inferSelect;
export type Message = typeof messages.$inferSelect;
