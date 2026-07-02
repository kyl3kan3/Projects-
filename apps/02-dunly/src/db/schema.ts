/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all Dunly tables. Single source of truth for the
 * data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: organizations, users, stripe_accounts, customers,
 *       subscriptions, payment_methods, payment_failures, recovery_campaigns,
 *       recovery_attempts, messages, webhook_events, recovered_revenue_events,
 *       audit_log (plus Auth.js accounts/sessions tables).
 * - [ ] pgEnum for plan, payment_failure status, message channel/status,
 *       attribution source, campaign type.
 * - [ ] Unique constraint on webhook_events.stripe_event_id (idempotency).
 * - [ ] Composite indexes: payment_failures (org, status),
 *       messages (payment_failure_id), payment_methods (exp_year, exp_month).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Row-level tenancy convention: every domain table carries
 *       organization_id or reaches it through stripe_accounts.
 */

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

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const stripeAccounts: unknown = undefined;
export const customers: unknown = undefined;
export const subscriptions: unknown = undefined;
export const paymentMethods: unknown = undefined;
export const paymentFailures: unknown = undefined;
export const recoveryCampaigns: unknown = undefined;
export const recoveryAttempts: unknown = undefined;
export const messages: unknown = undefined;
export const webhookEvents: unknown = undefined;
export const recoveredRevenueEvents: unknown = undefined;
export const auditLog: unknown = undefined;
