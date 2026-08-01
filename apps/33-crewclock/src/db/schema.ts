/**
 * Drizzle schema for CrewClock — the data model in ARCHITECTURE.md.
 *
 * Conventions, all of them load-bearing:
 *
 *  - **Money is integer cents.** Never a float, never a numeric-as-string.
 *  - **Worked time is integer seconds.** Punch instants are `timestamptz`;
 *    durations are derived, never stored rounded (README: the timesheet that
 *    cannot be rounded up).
 *  - **Rates are snapshotted onto the time entry** at punch time, so a raise in
 *    March never rewrites February's job cost.
 *  - **Multi-tenancy** hangs off `organization_id` on every domain table.
 *  - Statuses are `text` with a TS union via `$type<>()` rather than pg enums:
 *    adding a value later is a no-op migration instead of an ALTER TYPE dance.
 */

import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- types --- */

export type Plan = "crew" | "company";
export type Role = "owner" | "office" | "crew";
export type Locale = "en" | "es";
export type GeofenceStatus = "inside" | "outside" | "unavailable";
export type TimeEntrySource = "live" | "offline_sync" | "manual";
export type JobStatus = "bidding" | "active" | "complete" | "archived";
export type OvertimeRule = "weekly_40" | "daily_8_weekly_40" | "none";
export type ExportFormat = "adp" | "gusto";
export type ExportStatus = "pending" | "generated" | "failed";
export type PayPeriod = "weekly" | "biweekly" | "semimonthly";
export type AlertChannel = "email" | "sms";

/**
 * Review flags on a time entry. A flag never blocks a punch and never changes
 * pay on its own — it routes an entry to a human (README "Honest GPS").
 */
export type EntryFlag =
  | "outside_fence"
  | "no_gps"
  | "low_accuracy"
  | "stale_open"
  | "implausible_speed"
  | "shared_device"
  | "edited"
  | "manual";

export interface PunchLocation {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
}

/* --------------------------------------------------------- organizations --- */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").$type<Plan>().notNull().default("crew"),
  /**
   * IANA zone. Job sites may override it; this is the fallback and the timezone
   * every payroll week boundary is drawn in.
   */
  timezone: text("timezone").notNull().default("America/Chicago"),
  /** 0 = Sunday … 6 = Saturday. Drives the payroll week, not the calendar. */
  weekStartsOn: integer("week_starts_on").notNull().default(0),
  otWeeklyThresholdHours: integer("ot_weekly_threshold_hours").notNull().default(40),
  /** A shift open longer than this is flagged for review, never truncated. */
  maxShiftHours: integer("max_shift_hours").notNull().default(14),
  /** Unpaid meal auto-deduct. 0 disables it; only applies past the threshold. */
  autoBreakMinutes: integer("auto_break_minutes").notNull().default(0),
  autoBreakAfterHours: integer("auto_break_after_hours").notNull().default(6),
  payPeriod: text("pay_period").$type<PayPeriod>().notNull().default("weekly"),
  defaultLocale: text("default_locale").$type<Locale>().notNull().default("en"),
  /** Where OT / budget alerts go. Email always; SMS only when opted in. */
  alertEmail: text("alert_email"),
  alertPhone: text("alert_phone"),
  smsAlertsEnabled: boolean("sms_alerts_enabled").notNull().default(false),
  /** ADP company code — the ADP export's first column. */
  adpCompanyCode: text("adp_company_code"),
  stripeCustomerId: text("stripe_customer_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------------- users --- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Nullable: field crew often have no work email (ARCHITECTURE auth note). */
    email: text("email").unique(),
    phone: text("phone"),
    role: text("role").$type<Role>().notNull().default("crew"),
    locale: text("locale").$type<Locale>().notNull().default("en"),
    /** Loaded rate: wage + burden. Integer cents per hour. */
    hourlyCostCents: integer("hourly_cost_cents").notNull().default(0),
    overtimeRule: text("overtime_rule").$type<OvertimeRule>().notNull().default("weekly_40"),
    /** Owner/office sign in with a password (scrypt). */
    passwordHash: text("password_hash"),
    /** Crew claim a profile with a personal code, then a 4-digit PIN. */
    crewCode: text("crew_code").unique(),
    pinHash: text("pin_hash"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    /** ADP File # — the export validator refuses to run without it. */
    payrollFileNumber: text("payroll_file_number"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_org_idx").on(t.organizationId, t.active)],
);

/* ------------------------------------------------------------- job sites --- */

export const jobSites = pgTable(
  "job_sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    address: text("address").notNull().default(""),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /** Geofence radius in metres. 150m covers a residential lot plus parking. */
    radiusM: integer("radius_m").notNull().default(150),
    /** Overrides the org timezone for this site's week boundaries. */
    timezone: text("timezone"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("job_sites_org_idx").on(t.organizationId)],
);

/* ------------------------------------------------------------------ jobs --- */

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    jobSiteId: uuid("job_site_id").references(() => jobSites.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    clientName: text("client_name").notNull().default(""),
    /** The bid, as imported. Minutes (not fractional hours) and cents. */
    bidLaborMinutes: integer("bid_labor_minutes"),
    bidLaborCostCents: integer("bid_labor_cost_cents"),
    status: text("status").$type<JobStatus>().notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** Idempotency for the 80% / 100% budget alerts — fire once each, ever. */
    budgetAlert80SentAt: timestamp("budget_alert_80_sent_at", { withTimezone: true }),
    budgetAlert100SentAt: timestamp("budget_alert_100_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("jobs_org_status_idx").on(t.organizationId, t.status)],
);

/** Who may punch into what. */
export const crewAssignments = pgTable(
  "crew_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("crew_assignments_job_user_idx").on(t.jobId, t.userId)],
);

/* ---------------------------------------------------------- time entries --- */

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    clockInAt: timestamp("clock_in_at", { withTimezone: true }).notNull(),
    /** Null while the worker is on the clock. */
    clockOutAt: timestamp("clock_out_at", { withTimezone: true }),
    /**
     * Unpaid break in seconds — from the crew's break control, or the org's
     * auto-deduct rule applied at clock-out.
     */
    breakSeconds: integer("break_seconds").notNull().default(0),
    /** Set while a break is running; folded into `breakSeconds` when it ends. */
    breakStartedAt: timestamp("break_started_at", { withTimezone: true }),

    // --- honest GPS: the reading, its accuracy, and our verdict ---
    inLat: doublePrecision("in_lat"),
    inLng: doublePrecision("in_lng"),
    inAccuracyM: doublePrecision("in_accuracy_m"),
    inDistanceM: doublePrecision("in_distance_m"),
    geofenceStatusIn: text("geofence_status_in").$type<GeofenceStatus>(),
    outLat: doublePrecision("out_lat"),
    outLng: doublePrecision("out_lng"),
    outAccuracyM: doublePrecision("out_accuracy_m"),
    outDistanceM: doublePrecision("out_distance_m"),
    geofenceStatusOut: text("geofence_status_out").$type<GeofenceStatus>(),

    source: text("source").$type<TimeEntrySource>().notNull().default("live"),
    /**
     * Minted on the device, one per tap. The offline-outbox dedupe keys — both
     * halves of a shift need one: a retried clock-out whose id was not recorded
     * would look like a brand-new punch and could close a later shift.
     */
    clientEventId: text("client_event_id").notNull(),
    clientEventIdOut: text("client_event_id_out"),
    /** Coarse device id, for the buddy-punching signal. Never a tracking cookie. */
    deviceFingerprint: text("device_fingerprint"),

    /** Rate snapshot — job cost never moves when someone gets a raise. */
    rateCentsPerHour: integer("rate_cents_per_hour").notNull().default(0),

    flags: text("flags").array().$type<EntryFlag[]>().notNull().default([]),
    edited: boolean("edited").notNull().default(false),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The offline dedupe guarantee: a punch synced twice acts once. Two
    // indexes, because a shift carries two device event ids. Postgres treats
    // NULLs as distinct, so open shifts (no out id yet) never collide.
    uniqueIndex("time_entries_client_event_idx").on(t.organizationId, t.clientEventId),
    uniqueIndex("time_entries_client_event_out_idx").on(t.organizationId, t.clientEventIdOut),
    index("time_entries_user_time_idx").on(t.userId, t.clockInAt),
    index("time_entries_job_time_idx").on(t.jobId, t.clockInAt),
    index("time_entries_org_time_idx").on(t.organizationId, t.clockInAt),
  ],
);

/** Append-only audit trail. Never updated, never deleted. */
export const timeEntryEdits = pgTable(
  "time_entry_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    timeEntryId: uuid("time_entry_id")
      .notNull()
      .references(() => timeEntries.id, { onDelete: "cascade" }),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("time_entry_edits_entry_idx").on(t.timeEntryId, t.editedAt)],
);

/* ------------------------------------------------------- overtime alerts --- */

export const overtimeAlerts = pgTable(
  "overtime_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Local date of the payroll week's first day, in the org's timezone. */
    weekStart: date("week_start").notNull(),
    hoursToDate: doublePrecision("hours_to_date").notNull(),
    projectedHours: doublePrecision("projected_hours").notNull(),
    thresholdHours: doublePrecision("threshold_hours").notNull(),
    channel: text("channel").$type<AlertChannel>().notNull().default("email"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One alert per worker per week — enforced by Postgres, not by memory.
    uniqueIndex("overtime_alerts_user_week_idx").on(t.userId, t.weekStart),
  ],
);

/* ------------------------------------------------------- payroll exports --- */

export const payrollExports = pgTable(
  "payroll_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    format: text("format").$type<ExportFormat>().notNull(),
    /** Local dates, inclusive. A pay period is days, not instants. */
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: text("status").$type<ExportStatus>().notNull().default("pending"),
    fileKey: text("file_key").notNull().default(""),
    /**
     * The CSV itself. There is no object store in the MVP stack, and a pay
     * period for a 50-person crew is a few kilobytes — keeping the bytes here
     * makes a re-download months later reproduce the exact file that was sent.
     */
    csv: text("csv"),
    checksum: text("checksum"),
    rowCount: integer("row_count").notNull().default(0),
    /** Hundredths of an hour, integer — the unit the CSV carries. */
    totalCentihours: integer("total_centihours").notNull().default(0),
    generatedBy: uuid("generated_by").references(() => users.id, { onDelete: "set null" }),
    deliveredTo: text("delivered_to"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payroll_exports_org_idx").on(t.organizationId, t.createdAt)],
);

export const exportLineItems = pgTable(
  "export_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payrollExportId: uuid("payroll_export_id")
      .notNull()
      .references(() => payrollExports.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    regularCentihours: integer("regular_centihours").notNull().default(0),
    overtimeCentihours: integer("overtime_centihours").notNull().default(0),
    timeEntryIds: jsonb("time_entry_ids").$type<string[]>().notNull().default([]),
  },
  (t) => [index("export_line_items_export_idx").on(t.payrollExportId)],
);

/* --------------------------------------------------------------- billing --- */

export const subscriptions = pgTable("subscriptions", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  plan: text("plan").$type<Plan>().notNull(),
  status: text("status").notNull(),
  /** Billed seat quantity, kept in step with active headcount. */
  seatCount: integer("seat_count").notNull().default(1),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").notNull().unique(),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------- audit log --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "system" or a user id. */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull().default(""),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_idx").on(t.organizationId, t.createdAt)],
);

/** Locks a pay period once approved, so a later edit is a deliberate reopen. */
export const payPeriodApprovals = pgTable(
  "pay_period_approvals",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
    entryCount: integer("entry_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.periodStart, t.periodEnd] })],
);

/* --------------------------------------------------------- inferred types --- */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type JobSite = typeof jobSites.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type CrewAssignment = typeof crewAssignments.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type TimeEntryEdit = typeof timeEntryEdits.$inferSelect;
export type OvertimeAlert = typeof overtimeAlerts.$inferSelect;
export type PayrollExport = typeof payrollExports.$inferSelect;
export type ExportLineItem = typeof exportLineItems.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
