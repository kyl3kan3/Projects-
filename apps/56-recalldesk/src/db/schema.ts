/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all RecallDesk tables — the complete data model
 * from ARCHITECTURE.md ("Data Model"), fully defined. This file is the spine
 * of the build: migrations are generated from it via `npm run db:generate`,
 * and every module types itself against these tables.
 *
 * Invariants encoded here (enforce the rest in code + tests):
 * - attributions.booking_id is unique — a booking is attributed at most once.
 * - enrollments unique per (campaign_id, patient_id).
 * - call_tasks unique per (location_id, patient_id, queue_date).
 * - webhook_events unique per (provider, external_id) — idempotency ledger.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------- enums

export const planEnum = pgEnum("plan", [
  "chairside",
  "recall_engine",
  "group",
]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "office_manager",
  "front_desk",
]);

export const pmsSourceEnum = pgEnum("pms_source", [
  "dentrix",
  "eaglesoft",
  "opendental",
  "other",
]);

export const importStatusEnum = pgEnum("import_status", [
  "uploaded",
  "previewed",
  "committed",
  "rolled_back",
  "failed",
]);

export const overdueBucketEnum = pgEnum("overdue_bucket", [
  "current",
  "m3_6",
  "m6_12",
  "m12_24",
  "m24_plus",
]);

export const patientStatusEnum = pgEnum("patient_status", [
  "active",
  "inactive",
  "merged",
]);

export const visitKindEnum = pgEnum("visit_kind", ["hygiene", "other"]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "running",
  "paused",
  "completed",
]);

export const channelEnum = pgEnum("channel", ["email", "sms", "call"]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "completed",
  "stopped_booked",
  "stopped_opt_out",
  "stopped_manual",
]);

export const touchStatusEnum = pgEnum("touch_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "failed",
  "opted_out",
  "answered",
  "left_message",
]);

export const bookingRequestStatusEnum = pgEnum("booking_request_status", [
  "new",
  "contacted",
  "booked",
  "closed",
]);

export const bookingSourceEnum = pgEnum("booking_source", [
  "booking_link",
  "call",
  "front_desk_manual",
]);

export const callTaskStatusEnum = pgEnum("call_task_status", [
  "todo",
  "booked",
  "left_message",
  "call_back",
  "skip",
  "do_not_contact",
]);

// ---------------------------------------------------------------- tables

export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("chairside"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  baaSignedAt: timestamp("baa_signed_at", { withTimezone: true }),
  settings: jsonb("settings")
    .$type<{
      visitValueCents?: number;
      attributionWindowDays?: number;
    }>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/Chicago"),
    phone: text("phone"),
    bookingNotice: text("booking_notice").notNull().default(""),
    sendingDomain: text("sending_domain"),
    smsFromNumber: text("sms_from_number"),
    status: text("status", { enum: ["active", "paused"] })
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("locations_practice_idx").on(t.practiceId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("front_desk"),
    defaultLocationId: uuid("default_location_id").references(
      () => locations.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_practice_idx").on(t.practiceId),
  ],
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    source: pmsSourceEnum("source").notNull(),
    fileKey: text("file_key").notNull(),
    mapping: jsonb("mapping")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    status: importStatusEnum("status").notNull().default("uploaded"),
    rowCount: integer("row_count").notNull().default(0),
    patientCount: integer("patient_count").notNull().default(0),
    anomalies: jsonb("anomalies")
      .$type<{ code: string; message: string; severity: "info" | "warn" }[]>()
      .notNull()
      .default([]),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("imports_location_idx").on(t.locationId)],
);

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    externalId: text("external_id"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    emailConsent: boolean("email_consent").notNull().default(true),
    smsConsent: boolean("sms_consent").notNull().default(false),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    emailBouncedAt: timestamp("email_bounced_at", { withTimezone: true }),
    phoneFailedAt: timestamp("phone_failed_at", { withTimezone: true }),
    recallIntervalMonths: integer("recall_interval_months")
      .notNull()
      .default(6),
    lastVisitOn: timestamp("last_visit_on", { withTimezone: true }),
    nextDueOn: timestamp("next_due_on", { withTimezone: true }),
    overdueBucket: overdueBucketEnum("overdue_bucket")
      .notNull()
      .default("current"),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    status: patientStatusEnum("status").notNull().default("active"),
    importId: uuid("import_id").references(() => imports.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("patients_location_external_unique").on(
      t.locationId,
      t.externalId,
    ),
    index("patients_location_bucket_idx").on(t.locationId, t.overdueBucket),
    index("patients_next_due_idx").on(t.nextDueOn),
  ],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    visitedOn: timestamp("visited_on", { withTimezone: true }).notNull(),
    kind: visitKindEnum("kind").notNull().default("hygiene"),
    importId: uuid("import_id").references(() => imports.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("visits_patient_time_idx").on(t.patientId, t.visitedOn)],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id").references(() => practices.id),
    channel: channelEnum("channel").notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("templates_practice_idx").on(t.practiceId)],
);

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    segment: jsonb("segment")
      .$type<{
        buckets: string[];
        requiresEmail?: boolean;
        requiresSms?: boolean;
        excludeEnrolled?: boolean;
      }>()
      .notNull(),
    status: campaignStatusEnum("status").notNull().default("draft"),
    maxTouchesPerPatient: integer("max_touches_per_patient")
      .notNull()
      .default(4),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("campaigns_location_status_idx").on(t.locationId, t.status)],
);

export const campaignSteps = pgTable(
  "campaign_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    stepOrder: integer("step_order").notNull(),
    offsetDays: integer("offset_days").notNull(),
    channel: channelEnum("channel").notNull(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
  },
  (t) => [uniqueIndex("steps_unique").on(t.campaignId, t.stepOrder)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    nextStepOrder: integer("next_step_order").notNull().default(1),
    nextSendAt: timestamp("next_send_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("enrollments_unique").on(t.campaignId, t.patientId),
    index("enrollments_due_idx").on(t.status, t.nextSendAt),
  ],
);

export const touches = pgTable(
  "touches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    channel: channelEnum("channel").notNull(),
    templateId: uuid("template_id").references(() => templates.id),
    providerMessageId: text("provider_message_id"),
    status: touchStatusEnum("status").notNull().default("queued"),
    bookingTokenHash: text("booking_token_hash"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("touches_patient_time_idx").on(t.patientId, t.occurredAt),
    index("touches_location_time_idx").on(t.locationId, t.occurredAt),
  ],
);

export const bookingRequests = pgTable(
  "booking_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    touchId: uuid("touch_id").references(() => touches.id),
    preferredWindows: jsonb("preferred_windows")
      .$type<{ day: string; period: "am" | "pm" }[]>()
      .notNull()
      .default([]),
    note: text("note"),
    status: bookingRequestStatusEnum("status").notNull().default("new"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("booking_requests_status_idx").on(t.status)],
);

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    bookedAt: timestamp("booked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    appointmentOn: timestamp("appointment_on", { withTimezone: true }),
    source: bookingSourceEnum("source").notNull(),
    kept: boolean("kept"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("bookings_location_time_idx").on(t.locationId, t.bookedAt)],
);

export const attributions = pgTable(
  "attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    touchId: uuid("touch_id")
      .notNull()
      .references(() => touches.id),
    windowDays: integer("window_days").notNull(),
    productionCents: integer("production_cents").notNull(),
    attributedAt: timestamp("attributed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("attributions_booking_unique").on(t.bookingId)],
);

export const callTasks = pgTable(
  "call_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    queueDate: text("queue_date").notNull(), // "2026-07-17" location-local
    rank: integer("rank").notNull(),
    reason: jsonb("reason")
      .$type<{ bucket: string; valueCents: number; lastTouchDays?: number }>()
      .notNull(),
    status: callTaskStatusEnum("status").notNull().default("todo"),
    note: text("note"),
    handledBy: uuid("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("call_tasks_unique").on(t.locationId, t.patientId, t.queueDate),
    index("call_tasks_queue_idx").on(t.locationId, t.queueDate, t.rank),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", {
      enum: ["stripe", "twilio", "resend"],
    }).notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_external_unique").on(t.provider, t.externalId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_practice_time_idx").on(t.practiceId, t.occurredAt)],
);
