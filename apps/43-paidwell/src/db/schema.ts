/**
 * Drizzle schema — the data model in ARCHITECTURE.md, with three deliberate
 * shape decisions that the rest of the app leans on:
 *
 *  1. **Calendar dates are `date` columns holding ISO `YYYY-MM-DD` strings.**
 *     Payment terms are counted in calendar days, not hours, and the ladder's
 *     whole job is "how many days from the due date is it". Keeping due dates,
 *     promise dates and forecast weeks as ISO strings means the escalation
 *     arithmetic is exact integer day maths, never a timezone-dependent
 *     millisecond comparison — and a Date can never leak into a raw `sql`
 *     fragment where postgres.js would try to take its byte length.
 *     Instants that are genuinely instants (sent_at, created_at) stay
 *     `timestamptz`.
 *
 *  2. **Money is integer cents.** Every amount column is `integer` and named
 *     `*_cents`. Nothing in this app ever holds a float dollar value.
 *
 *  3. **The ladder is deduped in the database.** `messages` is unique on
 *     (sequence_run_id, step_index): a rung physically cannot be sent twice,
 *     whatever a sweep, a retry or a second server instance decides. That
 *     unique index is the real guarantee; the pure selection logic in
 *     src/lib/ladder.ts is the readable one.
 */

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* --------------------------------------------------------------- enums --- */

export const planEnum = pgEnum("plan", ["studio", "firm", "practice"]);
export const sendModeEnum = pgEnum("send_mode", ["approval", "autopilot"]);
export const toneEnum = pgEnum("tone", ["warm", "neutral", "firm"]);
export const providerEnum = pgEnum("accounting_provider", [
  "qbo",
  "xero",
  "csv",
  "stripe_invoicing",
]);
export const syncStatusEnum = pgEnum("sync_status", ["never", "syncing", "ok", "error"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "open",
  "partial",
  "paid",
  "written_off",
  "disputed",
]);
export const runStateEnum = pgEnum("run_state", [
  "scheduled",
  "running",
  "paused_promise",
  "paused_reply",
  "awaiting_approval",
  "completed",
  "stopped",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "awaiting_approval",
  "queued",
  "sent",
  "delivered",
  "bounced",
  "replied",
  "failed",
  "declined",
]);
export const promiseStatusEnum = pgEnum("promise_status", ["open", "kept", "broken"]);
export const promiseSourceEnum = pgEnum("promise_source", ["reply", "portal", "manual"]);
export const paymentMethodEnum = pgEnum("payment_method", ["card", "ach", "external"]);
export const roleEnum = pgEnum("role", ["owner", "member"]);

/* --------------------------------------------------------------- types --- */

export type Plan = (typeof planEnum.enumValues)[number];
export type SendMode = (typeof sendModeEnum.enumValues)[number];
export type TonePreset = (typeof toneEnum.enumValues)[number];
export type AccountingProvider = (typeof providerEnum.enumValues)[number];
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];
export type SequenceRunState = (typeof runStateEnum.enumValues)[number];
export type MessageStatus = (typeof messageStatusEnum.enumValues)[number];
export type PromiseStatus = (typeof promiseStatusEnum.enumValues)[number];
export type PromiseSource = (typeof promiseSourceEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

/** Escalation level: 1 heads-up, 2 gentle, 3 firm, 4 final. */
export type EscalationLevel = 1 | 2 | 3 | 4;

/**
 * One rung of the ladder. `offsetDaysFromDue` is a FIXED distance from the due
 * date — negative before it, positive after — which is what stops a sweep from
 * mailing the same client every day for eternity: a rung is a point in the
 * calendar, not a condition that stays true.
 */
export interface SequenceStep {
  offsetDaysFromDue: number;
  escalationLevel: EscalationLevel;
  /** Optional per-step overrides of the tone preset's copy. */
  subject?: string;
  body?: string;
}

export interface FirmSettings {
  /** Fallback terms for CSV rows and invoices with no due date. */
  defaultTermsDays: number;
  /** Minimum partial payment the portal will accept, in cents. */
  partialFloorCents: number;
  /** Off by default — a late-fee sentence is a relationship decision. */
  lateFeeMention: boolean;
  lateFeeCopy: string;
  /** Signature block appended to every follow-up. */
  signature: string;
}

export interface ForecastBasisEntry {
  invoiceId: string;
  number: string;
  clientName: string;
  expectedOn: string;
  amountCents: number;
  /** 0–100. */
  confidence: number;
  basis: "promise" | "behaviour" | "terms";
}

/* --------------------------------------------------------------- firms --- */

export const firms = pgTable("firms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("studio"),
  /** Practice-tier operators group several firms under one login. */
  firmGroupId: uuid("firm_group_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** The firm's own Connect account — portal money never touches ours. */
  stripeAccountId: text("stripe_account_id"),
  senderDomain: text("sender_domain"),
  senderVerified: boolean("sender_verified").notNull().default(false),
  replyToEmail: text("reply_to_email"),
  tone: toneEnum("tone").notNull().default("warm"),
  /**
   * `approval` (the default for every new firm) queues each send for a human
   * tap. `autopilot` sends without asking. See src/lib/sequences.ts.
   */
  sendMode: sendModeEnum("send_mode").notNull().default("approval"),
  /** The kill switch. One tap, and nothing leaves for anybody. */
  followUpPaused: boolean("follow_up_paused").notNull().default(false),
  settings: jsonb("settings").$type<FirmSettings>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const accountingConnections = pgTable(
  "accounting_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull(),
    /** QBO realm id / Xero tenant id / "upload" for CSV. */
    realmId: text("realm_id"),
    displayName: text("display_name"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: syncStatusEnum("sync_status").notNull().default("never"),
    syncError: text("sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("connection_firm_provider").on(t.firmId, t.provider)],
);

/* ------------------------------------------------------------- clients --- */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull().default("csv"),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    emails: jsonb("emails").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Overrides the firm's default terms for this client only. */
    termsDaysOverride: integer("terms_days_override"),
    /** VIP clients are never chased automatically — they surface for a human. */
    vip: boolean("vip").notNull().default(false),
    /** Rolling behaviour, recomputed from paid history. */
    avgDaysToPay: integer("avg_days_to_pay"),
    /** 0–100. */
    reliabilityScore: integer("reliability_score"),
    paidInvoiceCount: integer("paid_invoice_count").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("clients_external_unique").on(t.firmId, t.provider, t.externalId),
    index("clients_firm_idx").on(t.firmId, t.name),
  ],
);

/* ------------------------------------------------------------ invoices --- */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    provider: providerEnum("provider").notNull().default("csv"),
    externalId: text("external_id").notNull(),
    number: text("number").notNull(),
    issuedAt: date("issued_at").notNull(),
    dueAt: date("due_at").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /** What is still owed. Recomputed from payment rows, never incremented. */
    balanceCents: integer("balance_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    /**
     * A cache of what the money and the dates already say. Every read derives
     * status as-of-now (src/lib/invoices.ts#derivedStatus) so a sweep that never
     * ran can make this stale but cannot make a screen wrong.
     */
    status: invoiceStatusEnum("status").notNull().default("open"),
    pdfUrl: text("pdf_url"),
    paidAt: date("paid_at"),
    disputedNote: text("disputed_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invoices_external_unique").on(t.firmId, t.provider, t.externalId),
    index("invoices_firm_status_due_idx").on(t.firmId, t.status, t.dueAt),
    index("invoices_client_idx").on(t.clientId),
  ],
);

/* ----------------------------------------------------------- sequences --- */

export const sequences = pgTable("sequences", {
  id: uuid("id").primaryKey().defaultRandom(),
  firmId: uuid("firm_id")
    .notNull()
    .references(() => firms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tone: toneEnum("tone").notNull().default("warm"),
  steps: jsonb("steps").$type<SequenceStep[]>().notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sequenceRuns = pgTable(
  "sequence_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    state: runStateEnum("state").notNull().default("scheduled"),
    /**
     * The highest rung index already committed for this invoice; -1 means the
     * ladder has not started. Selection only ever returns a rung strictly above
     * this, so the ladder is monotonic and terminates.
     */
    highestStepSent: integer("highest_step_sent").notNull().default(-1),
    /** Fixed calendar date the next rung is due, derived from the due date. */
    nextSendOn: date("next_send_on"),
    /**
     * Set when a promise is broken: the ladder may then advance one rung
     * immediately with promise-aware copy, instead of waiting for the next fixed
     * offset to arrive.
     */
    escalateAfterBrokenPromise: boolean("escalate_after_broken_promise")
      .notNull()
      .default(false),
    pausedReason: text("paused_reason"),
    stoppedReason: text("stopped_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("runs_invoice_unique").on(t.invoiceId),
    index("runs_state_idx").on(t.state, t.nextSendOn),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    sequenceRunId: uuid("sequence_run_id")
      .notNull()
      .references(() => sequenceRuns.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    stepIndex: integer("step_index").notNull(),
    escalationLevel: integer("escalation_level").notNull(),
    promiseAware: boolean("promise_aware").notNull().default(false),
    toEmails: jsonb("to_emails").$type<string[]>().notNull(),
    subject: text("subject").notNull(),
    bodySnapshot: text("body_snapshot").notNull(),
    status: messageStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    /** Signed portal link this send carried, so the click is attributable. */
    portalToken: text("portal_token"),
    approvedByUserId: uuid("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // THE dedupe. One row per rung per run, enforced by Postgres.
    uniqueIndex("messages_run_step_unique").on(t.sequenceRunId, t.stepIndex),
    index("messages_firm_status_idx").on(t.firmId, t.status),
  ],
);

/** An inbound reply. Its arrival pauses the run and asks for a human. */
export const replies = pgTable(
  "replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    fromEmail: text("from_email").notNull(),
    snippet: text("snippet").notNull(),
    /** A date we think we saw in the reply — a suggestion, never auto-applied. */
    suggestedPromiseFor: date("suggested_promise_for"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("replies_invoice_idx").on(t.invoiceId)],
);

/* ------------------------------------------------------------ promises --- */

export const promises = pgTable(
  "promises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    promisedFor: date("promised_for").notNull(),
    amountCents: integer("amount_cents").notNull(),
    source: promiseSourceEnum("source").notNull(),
    status: promiseStatusEnum("status").notNull().default("open"),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("promises_status_for_idx").on(t.status, t.promisedFor),
    index("promises_invoice_idx").on(t.invoiceId),
  ],
);

/* ------------------------------------------------------------ payments --- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    method: paymentMethodEnum("method").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    /** External reference for payments that arrived in QBO/Xero, not here. */
    externalId: text("external_id"),
    recordedToAccountingAt: timestamp("recorded_to_accounting_at", { withTimezone: true }),
    writeBackError: text("write_back_error"),
    paidAt: date("paid_at").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A replayed Stripe webhook must not credit the same money twice. One
    // payment intent produces at most one row per invoice (a single intent may
    // legitimately cascade across several invoices, oldest first).
    uniqueIndex("payments_intent_invoice_unique").on(t.stripePaymentIntentId, t.invoiceId),
    uniqueIndex("payments_external_unique").on(t.firmId, t.externalId),
    index("payments_invoice_idx").on(t.invoiceId),
  ],
);

/** Unspent overpayment, held per client until the next invoice absorbs it. */
export const clientCredits = pgTable(
  "client_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("credits_client_idx").on(t.clientId)],
);

/* ------------------------------------------------------------ forecast --- */

export const forecastSnapshots = pgTable(
  "forecast_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    expectedCents: integer("expected_cents").notNull(),
    /** Weighted confidence in basis points, 0–10000. */
    confidenceBp: integer("confidence_bp").notNull().default(0),
    basis: jsonb("basis").$type<ForecastBasisEntry[]>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("forecast_week_unique").on(t.firmId, t.weekStart)],
);

/* --------------------------------------------------------------- audit --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firmId: uuid("firm_id")
      .notNull()
      .references(() => firms.id, { onDelete: "cascade" }),
    /** "system" or a user id. */
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_firm_idx").on(t.firmId, t.createdAt)],
);

/** Every Stripe event id we have already handled — replay tolerance. */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ----------------------------------------------------------- relations --- */

export const firmsRelations = relations(firms, ({ many }) => ({
  users: many(users),
  clients: many(clients),
  invoices: many(invoices),
  sequences: many(sequences),
}));

export const clientsRelations = relations(clients, ({ one, many }) => ({
  firm: one(firms, { fields: [clients.firmId], references: [firms.id] }),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  firm: one(firms, { fields: [invoices.firmId], references: [firms.id] }),
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  payments: many(payments),
  promises: many(promises),
}));

export const sequenceRunsRelations = relations(sequenceRuns, ({ one, many }) => ({
  invoice: one(invoices, { fields: [sequenceRuns.invoiceId], references: [invoices.id] }),
  sequence: one(sequences, { fields: [sequenceRuns.sequenceId], references: [sequences.id] }),
  messages: many(messages),
}));

/* ----------------------------------------------------------- row types --- */

export type Firm = typeof firms.$inferSelect;
export type User = typeof users.$inferSelect;
export type AccountingConnection = typeof accountingConnections.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Sequence = typeof sequences.$inferSelect;
export type SequenceRun = typeof sequenceRuns.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Reply = typeof replies.$inferSelect;
export type PromiseRow = typeof promises.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ForecastSnapshot = typeof forecastSnapshots.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
