/**
 * src/db/schema.ts
 *
 * Drizzle schema for TrainerBase — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off trainers.id. Program structure is
 * normalized (programs -> days -> rows); substitutions overlay per
 * assignment; logged sets dedupe on idempotency keys.
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

/** Tenant root; solo login lives inline. */
export const trainers = pgTable(
  "trainers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    handle: text("handle").notNull(),
    plan: text("plan", { enum: ["trial", "coach", "studio", "roster"] })
      .notNull()
      .default("trial"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeAccountId: text("stripe_account_id"),
    timezone: text("timezone").notNull().default("America/New_York"),
    /** jsonb: { driftThresholdDays: 5, checkinDay: 0 } */
    settings: jsonb("settings").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("trainers_email_idx").on(t.email), uniqueIndex("trainers_handle_idx").on(t.handle)],
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  status: text("status", { enum: ["invited", "active", "paused", "archived"] })
    .notNull()
    .default("invited"),
  magicTokenHash: text("magic_token_hash"),
  billingPackageId: uuid("billing_package_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingStatus: text("billing_status", { enum: ["ok", "overdue", "none"] })
    .notNull()
    .default("none"),
  startedOn: date("started_on"),
  notes: text("notes"),
  ...timestamps,
});

export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  name: text("name").notNull(),
  cues: text("cues"),
  videoUrl: text("video_url"),
  equipment: text("equipment"),
  muscleGroups: text("muscle_groups").array().notNull().default([]),
  archived: boolean("archived").notNull().default(false),
  ...timestamps,
});

export const programs = pgTable("programs", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  name: text("name").notNull(),
  description: text("description"),
  isTemplate: boolean("is_template").notNull().default(false),
  weeksCount: integer("weeks_count").notNull().default(4),
  ...timestamps,
});

export const programDays = pgTable(
  "program_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id").notNull().references(() => programs.id),
    weekIndex: integer("week_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    label: text("label").notNull(),
  },
  (t) => [uniqueIndex("program_days_pos_idx").on(t.programId, t.weekIndex, t.dayIndex)],
);

/** The prescription rows. */
export const programRows = pgTable("program_rows", {
  id: uuid("id").primaryKey().defaultRandom(),
  programDayId: uuid("program_day_id").notNull().references(() => programDays.id),
  seq: integer("seq").notNull(),
  exerciseId: uuid("exercise_id").notNull().references(() => exercises.id),
  sets: integer("sets").notNull(),
  reps: text("reps").notNull(),
  rpe: text("rpe"),
  tempo: text("tempo"),
  restSeconds: integer("rest_seconds"),
  supersetGroup: integer("superset_group"),
  note: text("note"),
  ...timestamps,
});

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  programId: uuid("program_id").notNull().references(() => programs.id),
  startsOn: date("starts_on").notNull(),
  status: text("status", { enum: ["active", "completed", "abandoned"] })
    .notNull()
    .default("active"),
  currentWeek: integer("current_week").notNull().default(0),
  currentDay: integer("current_day").notNull().default(0),
  ...timestamps,
});

/** Per-assignment overlays; the program is never forked. */
export const substitutions = pgTable(
  "substitutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
    programRowId: uuid("program_row_id").notNull().references(() => programRows.id),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("substitutions_row_idx").on(t.assignmentId, t.programRowId)],
);

/** opened_at is the adherence signal. */
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => assignments.id),
    weekIndex: integer("week_index").notNull(),
    dayIndex: integer("day_index").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    clientNote: text("client_note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("workout_sessions_day_idx").on(t.assignmentId, t.weekIndex, t.dayIndex)],
);

/** Weight as integer grams; idempotency_key dedupes the offline outbox. */
export const loggedSets = pgTable(
  "logged_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workoutSessionId: uuid("workout_session_id").notNull().references(() => workoutSessions.id),
    programRowId: uuid("program_row_id").notNull().references(() => programRows.id),
    setIndex: integer("set_index").notNull(),
    weightGrams: integer("weight_grams"),
    reps: integer("reps"),
    rpe: integer("rpe"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("logged_sets_idem_idx").on(t.idempotencyKey)],
);

export const checkinForms = pgTable("checkin_forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  /** jsonb: [{ key, label, kind: "number" | "text" | "photo" | "scale" }] */
  fields: jsonb("fields").notNull().default([]),
  cadence: text("cadence", { enum: ["weekly"] }).notNull().default("weekly"),
  dayOfWeek: integer("day_of_week").notNull().default(0),
  ...timestamps,
});

export const checkins = pgTable("checkins", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  formSnapshot: jsonb("form_snapshot").notNull(),
  answers: jsonb("answers").notNull().default({}),
  photoKeys: text("photo_keys").array().notNull().default([]),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reply: text("reply"),
  ...timestamps,
});

/** Context-anchored comments — not a chat app. */
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  anchorKind: text("anchor_kind", { enum: ["workout_session", "checkin"] }).notNull(),
  anchorId: uuid("anchor_id").notNull(),
  author: text("author", { enum: ["trainer", "client"] }).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  ...timestamps,
});

/** Billing products on the trainer's Connect account. */
export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  name: text("name").notNull(),
  amountCents: integer("amount_cents").notNull(),
  interval: text("interval", { enum: ["month"] }).notNull().default("month"),
  stripePriceId: text("stripe_price_id"),
  active: boolean("active").notNull().default(true),
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
  trainerId: uuid("trainer_id").notNull().references(() => trainers.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
