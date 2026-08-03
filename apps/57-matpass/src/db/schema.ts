/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all MatPass tables — the complete data model from
 * ARCHITECTURE.md ("Data Model"), fully defined. This file is the spine of
 * the build: migrations are generated from it via `npm run db:generate`,
 * and every module types itself against these tables.
 *
 * Invariants encoded here (enforce the rest in code + tests):
 * - enrollments unique per (student_id, program_id).
 * - checkins.client_key unique — offline kiosk sync is replay-safe.
 * - grading_candidates unique per (grading_event_id, enrollment_id).
 * - promotions is append-only (no update path is ever written for it;
 *   corrections append a reversal + new row).
 * - webhook_events unique per (provider, external_id).
 * - retention_flags: at most one OPEN flag per student (partial unique index —
 *   the nightly scan can then be run twice without duplicating a call sheet).
 *
 * Columns added during the build, beyond ARCHITECTURE.md's table list, and why:
 * - users.password_hash — the portfolio's auth convention is scrypt + a signed
 *   JWT cookie (AGENT_BRIEF.md), not Auth.js's adapter tables.
 * - students.kiosk_pin — the kiosk's second identification path ("searches
 *   name or enters PIN") needs somewhere to keep the PIN.
 * - enrollments.signoff_by / signoff_at — ranks with requires_signoff need the
 *   sign-off state the progression engine reads.
 * - subscriptions.failed_payments / last_dunning_on / escalated_at — dunning
 *   has to escalate after the second failure and must not mail daily forever.
 * - schools.billing_status — MatPass's own subscription state (trialing until
 *   checkout completes), separate from a family's tuition subscription.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------- enums

export const planEnum = pgEnum("plan", ["dojo", "academy", "federation"]);

export const userRoleEnum = pgEnum("user_role", [
  "owner",
  "instructor",
  "front_desk",
]);

export const programStatusEnum = pgEnum("program_status", [
  "active",
  "archived",
]);

export const studentStatusEnum = pgEnum("student_status", [
  "active",
  "paused",
  "inactive",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "active",
  "paused",
  "ended",
]);

export const checkinSourceEnum = pgEnum("checkin_source", [
  "kiosk",
  "desk",
  "import",
]);

export const kioskStatusEnum = pgEnum("kiosk_status", ["active", "revoked"]);

export const gradingEventStatusEnum = pgEnum("grading_event_status", [
  "draft",
  "inviting",
  "completed",
  "cancelled",
]);

export const candidateStatusEnum = pgEnum("candidate_status", [
  "eligible",
  "near_miss",
  "invited",
  "confirmed",
  "promoted",
  "held_back",
  "no_show",
]);

export const planKindEnum = pgEnum("membership_plan_kind", [
  "per_student",
  "family_flat",
]);

export const planIntervalEnum = pgEnum("membership_plan_interval", [
  "month",
  "year",
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "paused",
  "canceled",
]);

export const flagStatusEnum = pgEnum("flag_status", [
  "open",
  "contacted",
  "recovered",
  "lost",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "failed",
]);

export const billingStatusEnum = pgEnum("billing_status", [
  "trialing",
  "active",
  "past_due",
  "canceled",
]);

// ---------------------------------------------------------------- tables

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("dojo"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeAccountId: text("stripe_account_id"),
  billingStatus: billingStatusEnum("billing_status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  settings: jsonb("settings")
    .$type<{
      retentionBaselineFraction?: number;
      retentionMinDaysAbsent?: number;
      kioskPinEnabled?: boolean;
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
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    address: text("address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("locations_school_idx").on(t.schoolId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("front_desk"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_school_idx").on(t.schoolId),
  ],
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: programStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("programs_school_idx").on(t.schoolId)],
);

export const ranks = pgTable(
  "ranks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull(),
    beltColorHex: text("belt_color_hex").notNull().default("#FFFFFF"),
    stripes: integer("stripes").notNull().default(4),
    minClasses: integer("min_classes").notNull().default(0),
    minDaysInRank: integer("min_days_in_rank").notNull().default(0),
    requiresSignoff: boolean("requires_signoff").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("ranks_order_unique").on(t.programId, t.displayOrder)],
);

export const families = pgTable(
  "families",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    stripeCustomerId: text("stripe_customer_id"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("families_school_idx").on(t.schoolId)],
);

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthdate: timestamp("birthdate", { withTimezone: true }),
    photoKey: text("photo_key"),
    /** Kiosk's second identification path; 4 digits, unique per school. */
    kioskPin: text("kiosk_pin"),
    status: studentStatusEnum("status").notNull().default("active"),
    joinedOn: timestamp("joined_on", { withTimezone: true }),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("students_school_status_idx").on(t.schoolId, t.status),
    index("students_family_idx").on(t.familyId),
    uniqueIndex("students_pin_unique").on(t.schoolId, t.kioskPin),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    currentRankId: uuid("current_rank_id")
      .notNull()
      .references(() => ranks.id),
    currentStripes: integer("current_stripes").notNull().default(0),
    promotedAt: timestamp("promoted_at", { withTimezone: true }).notNull(),
    status: enrollmentStatusEnum("status").notNull().default("active"),
    /** Instructor sign-off for ranks with requires_signoff; cleared on promotion. */
    signoffBy: uuid("signoff_by").references(() => users.id),
    signoffAt: timestamp("signoff_at", { withTimezone: true }),
    /**
     * A paused enrollment's clock stops: days-in-rank counts up to this instant
     * instead of to now, so a summer pause does not manufacture eligibility.
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("enrollments_unique").on(t.studentId, t.programId),
    index("enrollments_program_idx").on(t.programId),
  ],
);

export const classSchedule = pgTable(
  "class_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id),
    locationId: uuid("location_id").references(() => locations.id),
    weekday: integer("weekday").notNull(), // 0 = Sunday
    startsAtMinutes: integer("starts_at_minutes").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    name: text("name").notNull(),
    instructorId: uuid("instructor_id").references(() => users.id),
    status: programStatusEnum("status").notNull().default("active"),
  },
  (t) => [index("schedule_program_idx").on(t.programId)],
);

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    classScheduleId: uuid("class_schedule_id").references(
      () => classSchedule.id,
    ),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: checkinSourceEnum("source").notNull().default("kiosk"),
    deviceId: uuid("device_id"),
    clientKey: text("client_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("checkins_client_key_unique").on(t.clientKey),
    index("checkins_enrollment_time_idx").on(t.enrollmentId, t.checkedInAt),
    index("checkins_student_time_idx").on(t.studentId, t.checkedInAt),
  ],
);

export const kioskDevices = pgTable(
  "kiosk_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: kioskStatusEnum("status").notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("kiosk_school_idx").on(t.schoolId)],
);

export const gradingEvents = pgTable(
  "grading_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    heldOn: timestamp("held_on", { withTimezone: true }).notNull(),
    programIds: jsonb("program_ids").$type<string[]>().notNull().default([]),
    status: gradingEventStatusEnum("status").notNull().default("draft"),
    gradedBy: uuid("graded_by").references(() => users.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("gradings_school_time_idx").on(t.schoolId, t.heldOn)],
);

export type EligibilitySnapshot = {
  classesDone: number;
  classesRequired: number;
  daysDone: number;
  daysRequired: number;
  signoffRequired: boolean;
  signoffDone: boolean;
  missing: string[];
};

export const gradingCandidates = pgTable(
  "grading_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gradingEventId: uuid("grading_event_id")
      .notNull()
      .references(() => gradingEvents.id),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    eligibility: jsonb("eligibility").$type<EligibilitySnapshot>().notNull(),
    status: candidateStatusEnum("status").notNull().default("eligible"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("candidates_unique").on(t.gradingEventId, t.enrollmentId),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    fromRankId: uuid("from_rank_id")
      .notNull()
      .references(() => ranks.id),
    fromStripes: integer("from_stripes").notNull(),
    toRankId: uuid("to_rank_id")
      .notNull()
      .references(() => ranks.id),
    toStripes: integer("to_stripes").notNull(),
    promotedOn: timestamp("promoted_on", { withTimezone: true }).notNull(),
    gradingEventId: uuid("grading_event_id").references(() => gradingEvents.id),
    gradedBy: uuid("graded_by").references(() => users.id),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("promotions_enrollment_time_idx").on(t.enrollmentId, t.promotedOn),
  ],
);

export const membershipPlans = pgTable(
  "membership_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    interval: planIntervalEnum("interval").notNull().default("month"),
    kind: planKindEnum("kind").notNull().default("per_student"),
    stripePriceId: text("stripe_price_id"),
    status: programStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("plans_school_idx").on(t.schoolId)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    membershipPlanId: uuid("membership_plan_id")
      .notNull()
      .references(() => membershipPlans.id),
    stripeSubscriptionId: text("stripe_subscription_id"),
    status: subscriptionStatusEnum("status").notNull().default("active"),
    studentIds: jsonb("student_ids").$type<string[]>().notNull().default([]),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    /** How many invoices have failed in the current past-due spell. */
    failedPayments: integer("failed_payments").notNull().default(0),
    /**
     * Date (school-local, YYYY-MM-DD) the last dunning email went out. The
     * dunning sweep is pinned to fixed distances from `past_due_since`, so a
     * family that never pays is mailed on days 0/3/7 and then never again —
     * "past due" stays true forever, and a naive daily sweep would too.
     */
    lastDunningOn: text("last_dunning_on"),
    /** Set when the second failure escalates it to a desk conversation. */
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscriptions_family_idx").on(t.familyId),
    index("subscriptions_status_idx").on(t.status),
  ],
);

export const retentionFlags = pgTable(
  "retention_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    flaggedOn: timestamp("flagged_on", { withTimezone: true })
      .notNull()
      .defaultNow(),
    baselinePerWeek: numeric("baseline_per_week", {
      precision: 4,
      scale: 2,
    }).notNull(),
    recentPerWeek: numeric("recent_per_week", {
      precision: 4,
      scale: 2,
    }).notNull(),
    lastSeenOn: timestamp("last_seen_on", { withTimezone: true }),
    status: flagStatusEnum("status").notNull().default("open"),
    outcomeNote: text("outcome_note").notNull().default(""),
    handledBy: uuid("handled_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("flags_student_status_idx").on(t.studentId, t.status),
    // One open flag per student, enforced by the database rather than by a
    // read-then-write race in the nightly scan.
    uniqueIndex("flags_one_open_per_student")
      .on(t.studentId)
      .where(sql`${t.status} = 'open'`),
  ],
);

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
    subject: text("subject").notNull(),
    bodyMd: text("body_md").notNull(),
    audience: jsonb("audience")
      .$type<{ all: boolean; programIds?: string[] }>()
      .notNull()
      .default({ all: true }),
    sentBy: uuid("sent_by").references(() => users.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("announcements_school_idx").on(t.schoolId)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    announcementId: uuid("announcement_id")
      .notNull()
      .references(() => announcements.id),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id),
    providerMessageId: text("provider_message_id"),
    status: deliveryStatusEnum("status").notNull().default("queued"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deliveries_announcement_idx").on(t.announcementId),
    // A re-run of the fan-out must not mail the same household twice.
    uniqueIndex("deliveries_unique").on(t.announcementId, t.familyId),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", { enum: ["stripe", "resend"] }).notNull(),
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
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id),
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
  (t) => [index("audit_school_time_idx").on(t.schoolId, t.occurredAt)],
);

// ---------------------------------------------------------------- row types

export type School = typeof schools.$inferSelect;
export type User = typeof users.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type Rank = typeof ranks.$inferSelect;
export type Family = typeof families.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type ClassSlot = typeof classSchedule.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type KioskDevice = typeof kioskDevices.$inferSelect;
export type GradingEvent = typeof gradingEvents.$inferSelect;
export type GradingCandidate = typeof gradingCandidates.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type RetentionFlag = typeof retentionFlags.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type PlanTier = (typeof planEnum.enumValues)[number];
export type CandidateStatus = (typeof candidateStatusEnum.enumValues)[number];
export type FlagStatus = (typeof flagStatusEnum.enumValues)[number];
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];
export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];
export type StudentStatus = (typeof studentStatusEnum.enumValues)[number];
export type GradingEventStatus = (typeof gradingEventStatusEnum.enumValues)[number];
