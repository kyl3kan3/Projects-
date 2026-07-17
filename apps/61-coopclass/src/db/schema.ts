/**
 * src/db/schema.ts
 *
 * Drizzle schema for CoopClass — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off coops.id. The enrollments table is
 * the contended row: capacity + conflict checks run atomically in the
 * enrollment transaction.
 */

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const coops = pgTable("coops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan", {
    enum: ["trial", "gathering", "community", "academy", "paused"],
  })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** Connect account carrying the co-op's family fees. */
  stripeAccountId: text("stripe_account_id"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** jsonb: { siblingDiscounts: [{ nth, percent }], familyCapCents, tiers } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coopId: uuid("coop_id").notNull().references(() => coops.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["director", "admin", "teacher", "parent"] })
      .notNull()
      .default("parent"),
    familyId: uuid("family_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  name: text("name").notNull(),
  tier: text("tier", { enum: ["returning", "new"] }).notNull().default("new"),
  primaryUserId: uuid("primary_user_id"),
  phone: text("phone"),
  emergencyContact: text("emergency_contact"),
  notes: text("notes"),
  balanceCents: integer("balance_cents").notNull().default(0),
  ...timestamps,
});

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  familyId: uuid("family_id").notNull().references(() => families.id),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  gradeLevel: integer("grade_level").notNull(),
  birthdate: date("birthdate"),
  allergies: text("allergies"),
  notes: text("notes"),
  ...timestamps,
});

export const terms = pgTable("terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  name: text("name").notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  status: text("status", { enum: ["draft", "registration", "active", "closed"] })
    .notNull()
    .default("draft"),
  ...timestamps,
});

/** Returning families open first — co-op law. */
export const registrationWindows = pgTable("registration_windows", {
  id: uuid("id").primaryKey().defaultRandom(),
  termId: uuid("term_id").notNull().references(() => terms.id),
  tier: text("tier", { enum: ["returning", "new", "all"] }).notNull(),
  opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
});

export const periods = pgTable("periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  termId: uuid("term_id").notNull().references(() => terms.id),
  label: text("label").notNull(),
  weekday: integer("weekday").notNull(),
  startsAtTime: time("starts_at_time").notNull(),
  endsAtTime: time("ends_at_time").notNull(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  name: text("name").notNull(),
  capacityNote: text("capacity_note"),
});

export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    termId: uuid("term_id").notNull().references(() => terms.id),
    periodId: uuid("period_id").notNull().references(() => periods.id),
    roomId: uuid("room_id").notNull().references(() => rooms.id),
    teacherUserId: uuid("teacher_user_id").references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    gradeMin: integer("grade_min").notNull(),
    gradeMax: integer("grade_max").notNull(),
    capacity: integer("capacity").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    materialsFeeCents: integer("materials_fee_cents").notNull().default(0),
    prerequisiteClassId: uuid("prerequisite_class_id"),
    status: text("status", { enum: ["draft", "open", "full", "cancelled"] })
      .notNull()
      .default("draft"),
    ...timestamps,
  },
  (t) => [
    index("classes_term_period_idx").on(t.termId, t.periodId),
    uniqueIndex("classes_room_period_idx").on(t.periodId, t.roomId),
  ],
);

/** The contended row. Unique (class, student); checks run in-transaction. */
export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id").notNull().references(() => classes.id),
    studentId: uuid("student_id").notNull().references(() => students.id),
    familyId: uuid("family_id").notNull().references(() => families.id),
    status: text("status", { enum: ["enrolled", "waitlisted", "dropped"] })
      .notNull()
      .default("enrolled"),
    waitlistPosition: integer("waitlist_position"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [uniqueIndex("enrollments_class_student_idx").on(t.classId, t.studentId)],
);

/** Per family per term; discounts are explicit lines, never a mystery. */
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  termId: uuid("term_id").notNull().references(() => terms.id),
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  status: text("status", {
    enum: ["draft", "sent", "paid", "plan_active", "overdue", "void"],
  })
    .notNull()
    .default("draft"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripeSubscriptionScheduleId: text("stripe_subscription_schedule_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...timestamps,
});

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  kind: text("kind", { enum: ["fee", "materials", "discount"] }).notNull(),
});

/** The binder: who is current, who lapses before term end. */
export const volunteers = pgTable("volunteers", {
  id: uuid("id").primaryKey().defaultRandom(),
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  userId: uuid("user_id").references(() => users.id),
  name: text("name").notNull(),
  roleLabel: text("role_label").notNull(),
  checkKind: text("check_kind", { enum: ["background", "clearance", "training"] }).notNull(),
  completedOn: date("completed_on"),
  expiresOn: date("expires_on"),
  documentNote: text("document_note"),
  status: text("status", { enum: ["valid", "expiring", "lapsed"] })
    .notNull()
    .default("valid"),
  ...timestamps,
});

export const attendanceRecords = pgTable("attendance_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id").notNull().references(() => classes.id),
  studentId: uuid("student_id").notNull().references(() => students.id),
  metOn: date("met_on").notNull(),
  present: boolean("present").notNull(),
  recordedBy: uuid("recorded_by").references(() => users.id),
  ...timestamps,
});

/** Digest send ledger. */
export const digests = pgTable("digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  familyId: uuid("family_id").notNull().references(() => families.id),
  weekOf: date("week_of").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
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
  coopId: uuid("coop_id").notNull().references(() => coops.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
