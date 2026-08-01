/**
 * Drizzle ORM schema for DuesDesk — the data model in ARCHITECTURE.md.
 *
 * Money rules that the shape of this file enforces:
 *
 *  - Every amount is an `integer` count of **cents**. There is no floating
 *    point anywhere in the ledger.
 *  - An invoice's total is never a stored number. It is the sum of its
 *    `invoice_lines` (assessment, late fee, late-fee waiver, adjustment), so a
 *    waived fee leaves a record instead of erasing one. Boards waive fees
 *    constantly and members ask why.
 *  - Settlement is the sum of that invoice's *settled* payments. `payments`
 *    carries a unique Stripe PaymentIntent id, so a retried webhook cannot
 *    credit the same money twice.
 *  - `webhook_events` is the outer idempotency gate: an event id we have seen
 *    is acknowledged and dropped before any handler runs.
 *  - `autopay_attempts` has a unique idempotency key per (invoice, attempt), so
 *    a double-fired cron cannot charge a household twice even if it crashes
 *    mid-run.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
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

export type Plan = "block" | "neighborhood" | "community";
export type AssociationKind = "hoa" | "condo" | "club" | "league";
export type BoardRole = "president" | "treasurer" | "secretary" | "member";

export type Cadence = "annual" | "quarterly" | "monthly" | "one_time";

/**
 * `processing` is not in ARCHITECTURE.md's list, and it is deliberate: ACH
 * takes days to settle and ROADMAP's acceptance criteria demand invoices show
 * "processing" until `succeeded`, never paid-then-unpaid.
 */
export type InvoiceStatus =
  | "draft"
  | "sent"
  | "processing"
  | "partial"
  | "paid"
  | "overdue"
  | "written_off";

export type InvoiceLineKind = "assessment" | "late_fee" | "late_fee_waiver" | "adjustment";

export type PaymentMethod = "card" | "ach" | "check" | "cash" | "other";
export type PaymentStatus = "pending" | "settled" | "failed" | "refunded";

export type AutopayStatus = "active" | "paused" | "failed";
export type AutopayAttemptStatus = "pending" | "succeeded" | "failed";

export type IssueKind = "violation" | "maintenance" | "architectural";
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type EventVisibility = "member_visible" | "board_only";
export type IssueEventKind = "comment" | "status_change" | "notice_sent";

export type DeliveryChannel = "email" | "sms";
export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "opted_out"
  | "skipped";

export type DocumentCategory = "bylaws" | "ccrs" | "minutes" | "budget" | "other";

/** Late-fee policy, stored on the schedule. Percent is basis points. */
export interface LateFeePolicy {
  graceDays: number;
  kind: "none" | "flat" | "percent";
  flatCents: number;
  percentBps: number;
  /** 0 = uncapped. */
  maxCents: number;
}

/** One rung of the delinquency ladder. */
export interface ReminderRung {
  afterDays: number;
  channel: DeliveryChannel;
  tone: "gentle" | "firm" | "board";
  subject: string;
  body: string;
}

export interface AssociationSettings {
  reminderLadder: ReminderRung[];
  /** Month (1-12) the fiscal year starts. Drives period labels. */
  fiscalYearStartMonth: number;
  /** Free-text the treasurer can put on invoices ("Checks to PO Box 42"). */
  invoiceFooter: string;
}

export type SegmentSpec =
  | { kind: "all" }
  | { kind: "delinquent"; bucket: "any" | "30" | "60" | "90" }
  | { kind: "units"; householdIds: string[] };

/* ----------------------------------------------------- associations/users --- */

export const associations = pgTable("associations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kind: text("kind").$type<AssociationKind>().notNull().default("hoa"),
  plan: text("plan").$type<Plan>().notNull().default("block"),
  timezone: text("timezone").notNull().default("America/New_York"),
  /** Our own Stripe Billing customer. */
  stripeCustomerId: text("stripe_customer_id"),
  /** The association's OWN Connect account. Dues never touch our balance. */
  stripeAccountId: text("stripe_account_id"),
  stripeAccountReady: boolean("stripe_account_ready").notNull().default(false),
  settings: jsonb("settings").$type<AssociationSettings>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  associationId: uuid("association_id")
    .notNull()
    .references(() => associations.id, { onDelete: "cascade" }),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<BoardRole>().notNull().default("member"),
  /** "Treasurer since Mar 2025" — turnover context the next board inherits. */
  termNote: text("term_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  associationId: uuid("association_id")
    .primaryKey()
    .references(() => associations.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  plan: text("plan").$type<Plan>().notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------- households/members --- */

export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    unitLabel: text("unit_label").notNull(),
    mailingAddress: text("mailing_address"),
    /** joined/left dates are the turnover record — never deleted. */
    joinedOn: date("joined_on").notNull(),
    leftOn: date("left_on"),
    /** Successor household when a home is sold; balances never transfer. */
    succeededById: uuid("succeeded_by_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("households_assoc_idx").on(t.associationId),
    uniqueIndex("households_unit_open_idx")
      .on(t.associationId, t.unitLabel)
      .where(sql`left_on is null`),
  ],
);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    /** SHA-256 of the live portal token's jti. Revoke by nulling it. */
    portalTokenHash: text("portal_token_hash"),
    portalTokenIssuedAt: timestamp("portal_token_issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("members_household_idx").on(t.householdId)],
);

/* ------------------------------------------------------------------ dues --- */

export const assessmentSchedules = pgTable(
  "assessment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cadence: text("cadence").$type<Cadence>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** Day of month the period's invoice falls due (1-28). */
    dueDay: integer("due_day").notNull().default(1),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    /** Mid-period joiners pay for the days they own the unit. */
    prorate: boolean("prorate").notNull().default(true),
    lateFeePolicy: jsonb("late_fee_policy").$type<LateFeePolicy>().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedules_assoc_idx").on(t.associationId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    assessmentScheduleId: uuid("assessment_schedule_id").references(
      () => assessmentSchedules.id,
      { onDelete: "set null" },
    ),
    periodLabel: text("period_label").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueOn: date("due_on").notNull(),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    /**
     * The late-fee policy snapshotted at generation. A board that changes its
     * CC&R fee in June must not retroactively re-price April's invoices.
     */
    lateFeePolicy: jsonb("late_fee_policy").$type<LateFeePolicy>().notNull(),
    /** Human note when the amount isn't the full period ("joined May 12"). */
    prorationNote: text("proration_note"),
    lateFeeAppliedAt: timestamp("late_fee_applied_at", { withTimezone: true }),
    /** Highest reminder rung already sent (-1 = none). */
    reminderRungSent: integer("reminder_rung_sent").notNull().default(-1),
    reminderRungSentAt: timestamp("reminder_rung_sent_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One invoice per household per schedule per period. This is what makes a
    // double-fired invoice run a no-op instead of a double bill.
    uniqueIndex("invoices_period_idx").on(
      t.householdId,
      t.assessmentScheduleId,
      t.periodLabel,
    ),
    index("invoices_assoc_status_idx").on(t.associationId, t.status, t.dueOn),
    index("invoices_household_idx").on(t.householdId, t.dueOn),
  ],
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    kind: text("kind").$type<InvoiceLineKind>().notNull(),
    description: text("description").notNull(),
    /** Signed: a waiver is a negative line, so the fee stays on the record. */
    amountCents: integer("amount_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    method: text("method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("settled"),
    /** What the household paid. */
    amountCents: integer("amount_cents").notNull(),
    /** How much of it this invoice could absorb. */
    appliedCents: integer("applied_cents").notNull(),
    /** The overpayment remainder, parked as household credit. */
    creditCents: integer("credit_cents").notNull().default(0),
    /** Unique: a retried webhook for the same intent cannot double-credit. */
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    reference: text("reference"),
    receivedOn: date("received_on").notNull(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_intent_idx").on(t.stripePaymentIntentId),
    index("payments_household_idx").on(t.householdId, t.receivedOn),
    index("payments_invoice_idx").on(t.invoiceId),
  ],
);

export const autopayEnrollments = pgTable(
  "autopay_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripePaymentMethodId: text("stripe_payment_method_id").notNull(),
    method: text("method").$type<"card" | "ach">().notNull(),
    status: text("status").$type<AutopayStatus>().notNull().default("active"),
    enrolledByMemberId: uuid("enrolled_by_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    lastChargeAt: timestamp("last_charge_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastError: text("last_error"),
  },
  (t) => [
    // One enrollment per household, ever. Re-enrolling updates this row.
    uniqueIndex("autopay_household_idx").on(t.householdId),
  ],
);

export const autopayAttempts = pgTable(
  "autopay_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => autopayEnrollments.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    /** `invoice:{id}:{attemptNo}` — also Stripe's idempotency key. */
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").$type<AutopayAttemptStatus>().notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    error: text("error"),
    /** Set on the first failure: the single retry's earliest date. */
    retryAfter: date("retry_after"),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("autopay_attempt_key_idx").on(t.idempotencyKey),
    index("autopay_attempt_invoice_idx").on(t.invoiceId),
  ],
);

/* ---------------------------------------------------------------- issues --- */

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    householdId: uuid("household_id").references(() => households.id, {
      onDelete: "set null",
    }),
    /** Yearly sequence, e.g. "2026-014". */
    number: text("number").notNull(),
    year: integer("year").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind").$type<IssueKind>().notNull(),
    title: text("title").notNull(),
    status: text("status").$type<IssueStatus>().notNull().default("open"),
    visibilityDefault: text("visibility_default")
      .$type<EventVisibility>()
      .notNull()
      .default("member_visible"),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    openedByMemberId: uuid("opened_by_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    resolutionNote: text("resolution_note"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("issues_number_idx").on(t.associationId, t.number),
    uniqueIndex("issues_seq_idx").on(t.associationId, t.year, t.seq),
    index("issues_assoc_status_idx").on(t.associationId, t.status),
  ],
);

export const issueEvents = pgTable(
  "issue_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    kind: text("kind").$type<IssueEventKind>().notNull().default("comment"),
    visibility: text("visibility").$type<EventVisibility>().notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorMemberId: uuid("author_member_id").references(() => members.id, {
      onDelete: "set null",
    }),
    /** "DuesDesk" when neither author is set (a status flip from a job). */
    authorLabel: text("author_label").notNull(),
    body: text("body").notNull(),
    photoKeys: text("photo_keys").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("issue_events_issue_idx").on(t.issueId, t.createdAt)],
);

/* --------------------------------------------------------- announcements --- */

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    bodyMd: text("body_md").notNull(),
    segment: jsonb("segment").$type<SegmentSpec>().notNull(),
    channels: text("channels").array().$type<DeliveryChannel[]>().notNull(),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_assoc_idx").on(t.associationId, t.createdAt)],
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    announcementId: uuid("announcement_id").references(() => announcements.id, {
      onDelete: "cascade",
    }),
    /** Set for invoice/reminder/notice sends instead of an announcement. */
    invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    channel: text("channel").$type<DeliveryChannel>().notNull(),
    /** Address/number as sent, so a later roster edit doesn't rewrite history. */
    destination: text("destination").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status").$type<DeliveryStatus>().notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("deliveries_announcement_idx").on(t.announcementId, t.status),
    index("deliveries_invoice_idx").on(t.invoiceId),
    // One send per (announcement, member, channel): re-running a fan-out that
    // half-failed cannot re-email the people who already got it.
    uniqueIndex("deliveries_announcement_member_idx").on(
      t.announcementId,
      t.memberId,
      t.channel,
    ),
  ],
);

/* ------------------------------------------------------------- documents --- */

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").$type<DocumentCategory>().notNull().default("other"),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull().default("application/octet-stream"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    versionLabel: text("version_label").notNull().default("v1"),
    memberVisible: boolean("member_visible").notNull().default(true),
    /** Set when a newer version supersedes this row; history is kept. */
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_assoc_idx").on(t.associationId, t.category)],
);

/* --------------------------------------------------- audit + idempotency --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    associationId: uuid("association_id")
      .notNull()
      .references(() => associations.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_assoc_idx").on(t.associationId, t.createdAt)],
);

/**
 * Seen webhook event ids. The insert is the gate: `onConflictDoNothing` that
 * returns no row means this delivery is a retry and the handler must not run.
 */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.source, t.eventId] })],
);

/** Cron bookkeeping: which job ran for which logical day. */
export const jobRuns = pgTable(
  "job_runs",
  {
    job: text("job").notNull(),
    runDate: date("run_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
  },
  (t) => [primaryKey({ columns: [t.job, t.runDate] })],
);

/* ------------------------------------------------------------- relations --- */

export const householdRelations = relations(households, ({ many, one }) => ({
  members: many(members),
  invoices: many(invoices),
  association: one(associations, {
    fields: [households.associationId],
    references: [associations.id],
  }),
}));

export const memberRelations = relations(members, ({ one }) => ({
  household: one(households, {
    fields: [members.householdId],
    references: [households.id],
  }),
}));

export const invoiceRelations = relations(invoices, ({ many, one }) => ({
  lines: many(invoiceLines),
  payments: many(payments),
  household: one(households, {
    fields: [invoices.householdId],
    references: [households.id],
  }),
}));

export const invoiceLineRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
}));

export const paymentRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  household: one(households, {
    fields: [payments.householdId],
    references: [households.id],
  }),
}));

export const issueRelations = relations(issues, ({ many, one }) => ({
  events: many(issueEvents),
  household: one(households, {
    fields: [issues.householdId],
    references: [households.id],
  }),
}));

export const issueEventRelations = relations(issueEvents, ({ one }) => ({
  issue: one(issues, { fields: [issueEvents.issueId], references: [issues.id] }),
}));

/* -------------------------------------------------------- inferred types --- */

export type Association = typeof associations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;
export type AssessmentSchedule = typeof assessmentSchedules.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceLine = typeof invoiceLines.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AutopayEnrollment = typeof autopayEnrollments.$inferSelect;
export type AutopayAttempt = typeof autopayAttempts.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type IssueEvent = typeof issueEvents.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type Delivery = typeof deliveries.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
