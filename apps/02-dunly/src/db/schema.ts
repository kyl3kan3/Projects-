import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* Multi-tenancy: everything hangs off organizations. */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "starter", "growth", "scale", "performance"] })
    .notNull()
    .default("trial"),
  billingStripeCustomerId: text("billing_stripe_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  mrrUnderManagementCents: integer("mrr_under_management_cents").notNull().default(0),
  settings: jsonb("settings")
    .$type<{
      senderDomain?: string;
      senderVerified?: boolean;
      fromName?: string;
      finalStepAction?: "cancel" | "leave_past_due";
    }>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("owner"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const stripeAccounts = pgTable(
  "stripe_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    livemode: boolean("livemode").notNull().default(false),
    defaultCurrency: text("default_currency").notNull().default("usd"),
    webhookStatus: text("webhook_status", { enum: ["pending", "active", "error"] })
      .notNull()
      .default("pending"),
    backfillCompletedAt: timestamp("backfill_completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("stripe_accounts_acct_idx").on(t.stripeAccountId)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeAccountId: uuid("stripe_account_id")
      .notNull()
      .references(() => stripeAccounts.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    email: text("email"),
    phone: text("phone"),
    name: text("name"),
    delinquent: boolean("delinquent").notNull().default(false),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    unsubscribedAt: timestamp("unsubscribed_at"),
    suppressedAt: timestamp("suppressed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_stripe_idx").on(t.stripeAccountId, t.stripeCustomerId)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    status: text("status").notNull(),
    mrrCents: integer("mrr_cents").notNull().default(0),
    currentPeriodEnd: timestamp("current_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriptions_stripe_idx").on(t.stripeSubscriptionId)],
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    stripePaymentMethodId: text("stripe_payment_method_id").notNull(),
    brand: text("brand"),
    last4: text("last4"),
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_methods_stripe_idx").on(t.stripePaymentMethodId),
    index("payment_methods_expiry_idx").on(t.expYear, t.expMonth),
  ],
);

/* The central work item: one per failing invoice. */
export const paymentFailures = pgTable(
  "payment_failures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    declineCode: text("decline_code"),
    failureReason: text("failure_reason"),
    status: text("status", {
      enum: ["open", "recovering", "recovered", "lost", "canceled"],
    })
      .notNull()
      .default("open"),
    stripeSmartRetriesActive: boolean("stripe_smart_retries_active").notNull().default(false),
    firstFailedAt: timestamp("first_failed_at").notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolution: text("resolution", {
      enum: ["dunly_retry", "dunly_message", "stripe_auto", "customer_direct"],
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_failures_invoice_idx").on(t.stripeInvoiceId),
    index("payment_failures_org_status_idx").on(t.organizationId, t.status),
  ],
);

/* A configured sequence template per org. */
export type CampaignStep = { offsetHours: number; channel: "email" | "sms"; templateKey: string };
export type RetryStep = { offsetHours: number };

export const recoveryCampaigns = pgTable("recovery_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["dunning", "pre_dunning"] }).notNull(),
  trigger: text("trigger", { enum: ["payment_failed", "card_expiring"] }).notNull(),
  name: text("name").notNull(),
  steps: jsonb("steps").$type<CampaignStep[]>().notNull().default([]),
  retrySchedule: jsonb("retry_schedule").$type<RetryStep[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* One row per retry we execute. */
export const recoveryAttempts = pgTable(
  "recovery_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentFailureId: uuid("payment_failure_id")
      .notNull()
      .references(() => paymentFailures.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    executedAt: timestamp("executed_at"),
    bullmqJobId: text("bullmq_job_id"),
    result: text("result", { enum: ["pending", "succeeded", "failed", "skipped", "canceled"] })
      .notNull()
      .default("pending"),
    declineCode: text("decline_code"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("recovery_attempts_failure_idx").on(t.paymentFailureId)],
);

/* One row per email/SMS sent. */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentFailureId: uuid("payment_failure_id").references(() => paymentFailures.id, {
      onDelete: "cascade",
    }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => recoveryCampaigns.id, {
      onDelete: "set null",
    }),
    stepIndex: integer("step_index").notNull().default(0),
    channel: text("channel", { enum: ["email", "sms"] }).notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status", {
      enum: ["queued", "sent", "delivered", "bounced", "complained", "clicked", "skipped"],
    })
      .notNull()
      .default("queued"),
    cardUpdateToken: text("card_update_token"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_failure_idx").on(t.paymentFailureId),
    index("messages_org_idx").on(t.organizationId),
  ],
);

/* Raw ingestion log for idempotency + replay. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeAccountId: text("stripe_account_id"),
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_event_idx").on(t.stripeEventId)],
);

/* The attribution ledger the dashboard and Performance billing read from. */
export const recoveredRevenueEvents = pgTable(
  "recovered_revenue_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    paymentFailureId: uuid("payment_failure_id").references(() => paymentFailures.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    kind: text("kind", { enum: ["recovery", "prevented"] }).notNull().default("recovery"),
    attributedTo: text("attributed_to", { enum: ["retry", "email", "sms", "baseline"] }).notNull(),
    recoveryAttemptId: uuid("recovery_attempt_id").references(() => recoveryAttempts.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "set null" }),
    recoveredAt: timestamp("recovered_at").notNull().defaultNow(),
  },
  (t) => [index("rre_org_time_idx").on(t.organizationId, t.recoveredAt)],
);

/* Every action we take on a connected account. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_org_idx").on(t.organizationId, t.createdAt)],
);
