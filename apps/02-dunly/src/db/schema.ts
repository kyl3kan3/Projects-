import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type Plan = "starter" | "growth" | "scale" | "performance";

export type PaymentFailureStatus =
  | "open"
  | "recovering"
  | "recovered"
  | "lost"
  | "canceled";

export type AttributionSource = "retry" | "email" | "sms" | "baseline";

export type MessageChannel = "email" | "sms";

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "complained"
  | "clicked";

export interface CampaignStep {
  offsetHours: number;
  channel: MessageChannel;
  templateId: string;
}

export interface RetryScheduleEntry {
  offsetHours: number;
}

export type CampaignType = "dunning" | "pre_dunning";
export type CampaignTrigger = "payment_failed" | "card_expiring";
export type RecoveryAttemptResult = "scheduled" | "succeeded" | "failed" | "skipped";
export type AuditActor = "system" | "user";

export interface OrganizationSettings {
  brandColor?: string;
  senderDomain?: string;
  retryWindowLocalHour?: number;
  smartRetrySuppressionHours?: number;
}

export const planEnum = pgEnum("plan", ["starter", "growth", "scale", "performance"]);
export const roleEnum = pgEnum("role", ["owner", "member"]);
export const accessModeEnum = pgEnum("access_mode", ["standard_connect"]);
export const failureStatusEnum = pgEnum("payment_failure_status", [
  "open",
  "recovering",
  "recovered",
  "lost",
  "canceled",
]);
export const failureResolutionEnum = pgEnum("failure_resolution", [
  "dunly_retry",
  "dunly_message",
  "stripe_auto",
  "customer_direct",
]);
export const campaignTypeEnum = pgEnum("campaign_type", ["dunning", "pre_dunning"]);
export const campaignTriggerEnum = pgEnum("campaign_trigger", ["payment_failed", "card_expiring"]);
export const messageChannelEnum = pgEnum("message_channel", ["email", "sms"]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "clicked",
]);
export const attemptResultEnum = pgEnum("recovery_attempt_result", [
  "scheduled",
  "succeeded",
  "failed",
  "skipped",
]);
export const attributionSourceEnum = pgEnum("attribution_source", ["retry", "email", "sms", "baseline"]);
export const auditActorEnum = pgEnum("audit_actor", ["system", "user"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("starter"),
  billingStripeCustomerId: text("billing_stripe_customer_id"),
  billingStripeSubscriptionId: text("billing_stripe_subscription_id"),
  mrrUnderManagementCents: integer("mrr_under_management_cents").notNull().default(0),
  settings: jsonb("settings").$type<OrganizationSettings>().notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: roleEnum("role").notNull().default("owner"),
    image: text("image"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    orgIdx: index("users_org_idx").on(table.organizationId),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);

export const stripeAccounts = pgTable(
  "stripe_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    stripeAccountId: text("stripe_account_id").notNull(),
    accessMode: accessModeEnum("access_mode").notNull().default("standard_connect"),
    livemode: boolean("livemode").notNull().default(false),
    defaultCurrency: text("default_currency").notNull().default("usd"),
    webhookStatus: text("webhook_status").notNull().default("pending"),
    backfillCompletedAt: timestamp("backfill_completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    accountIdx: uniqueIndex("stripe_accounts_account_idx").on(table.stripeAccountId),
    orgIdx: index("stripe_accounts_org_idx").on(table.organizationId),
  }),
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    stripeAccountId: uuid("stripe_account_id").notNull().references(() => stripeAccounts.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").notNull(),
    email: text("email"),
    phone: text("phone"),
    name: text("name"),
    delinquent: boolean("delinquent").notNull().default(false),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    stripeCustomerIdx: uniqueIndex("customers_stripe_customer_idx").on(table.stripeAccountId, table.stripeCustomerId),
    orgIdx: index("customers_org_idx").on(table.organizationId),
  }),
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    status: text("status").notNull(),
    mrrCents: integer("mrr_cents").notNull().default(0),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    subscriptionIdx: uniqueIndex("subscriptions_stripe_subscription_idx").on(table.stripeSubscriptionId),
    customerIdx: index("subscriptions_customer_idx").on(table.customerId),
  }),
);

export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    stripePaymentMethodId: text("stripe_payment_method_id").notNull(),
    brand: text("brand"),
    last4: text("last4"),
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    expIdx: index("payment_methods_exp_idx").on(table.expYear, table.expMonth),
    customerIdx: index("payment_methods_customer_idx").on(table.customerId),
  }),
);

export const paymentFailures = pgTable(
  "payment_failures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    amountDueCents: integer("amount_due_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    declineCode: text("decline_code"),
    failureReason: text("failure_reason"),
    status: failureStatusEnum("status").notNull().default("open"),
    firstFailedAt: timestamp("first_failed_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolution: failureResolutionEnum("resolution"),
    ...timestamps,
  },
  (table) => ({
    invoiceIdx: uniqueIndex("payment_failures_invoice_idx").on(table.stripeInvoiceId),
    orgStatusIdx: index("payment_failures_org_status_idx").on(table.organizationId, table.status),
    customerIdx: index("payment_failures_customer_idx").on(table.customerId),
  }),
);

export const recoveryCampaigns = pgTable(
  "recovery_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: campaignTypeEnum("type").notNull(),
    trigger: campaignTriggerEnum("trigger").notNull(),
    steps: jsonb("steps").$type<CampaignStep[]>().notNull(),
    retrySchedule: jsonb("retry_schedule").$type<RetryScheduleEntry[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    orgTypeIdx: index("recovery_campaigns_org_type_idx").on(table.organizationId, table.type),
  }),
);

export const recoveryAttempts = pgTable(
  "recovery_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    paymentFailureId: uuid("payment_failure_id").notNull().references(() => paymentFailures.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    bullmqJobId: text("bullmq_job_id"),
    result: attemptResultEnum("result").notNull().default("scheduled"),
    declineCode: text("decline_code"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    ...timestamps,
  },
  (table) => ({
    failureIdx: index("recovery_attempts_failure_idx").on(table.paymentFailureId),
    scheduledIdx: index("recovery_attempts_scheduled_idx").on(table.scheduledFor),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    paymentFailureId: uuid("payment_failure_id").references(() => paymentFailures.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => recoveryCampaigns.id),
    stepIndex: integer("step_index").notNull().default(0),
    channel: messageChannelEnum("channel").notNull(),
    providerMessageId: text("provider_message_id"),
    status: messageStatusEnum("status").notNull().default("queued"),
    cardUpdateToken: text("card_update_token"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    failureIdx: index("messages_failure_idx").on(table.paymentFailureId),
    customerIdx: index("messages_customer_idx").on(table.customerId),
  }),
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    stripeAccountId: uuid("stripe_account_id").references(() => stripeAccounts.id, { onDelete: "cascade" }),
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    ...timestamps,
  },
  (table) => ({
    eventIdx: uniqueIndex("webhook_events_stripe_event_idx").on(table.stripeEventId),
    accountIdx: index("webhook_events_account_idx").on(table.stripeAccountId),
  }),
);

export const recoveredRevenueEvents = pgTable(
  "recovered_revenue_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    paymentFailureId: uuid("payment_failure_id").notNull().references(() => paymentFailures.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    attributedTo: attributionSourceEnum("attributed_to").notNull(),
    recoveryAttemptId: uuid("recovery_attempt_id").references(() => recoveryAttempts.id),
    messageId: uuid("message_id").references(() => messages.id),
    recoveredAt: timestamp("recovered_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => ({
    orgRecoveredIdx: index("recovered_revenue_events_org_recovered_idx").on(table.organizationId, table.recoveredAt),
    failureIdx: index("recovered_revenue_events_failure_idx").on(table.paymentFailureId),
  }),
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    actor: auditActorEnum("actor").notNull().default("system"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    target: text("target").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index("audit_log_org_idx").on(table.organizationId, table.createdAt),
  }),
);

export const organizationRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  stripeAccounts: many(stripeAccounts),
  failures: many(paymentFailures),
  campaigns: many(recoveryCampaigns),
}));

export const customerRelations = relations(customers, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [customers.organizationId],
    references: [organizations.id],
  }),
  paymentFailures: many(paymentFailures),
  paymentMethods: many(paymentMethods),
  subscriptions: many(subscriptions),
}));

export const failureRelations = relations(paymentFailures, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [paymentFailures.organizationId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [paymentFailures.customerId],
    references: [customers.id],
  }),
  attempts: many(recoveryAttempts),
  messages: many(messages),
  recoveredEvents: many(recoveredRevenueEvents),
}));
