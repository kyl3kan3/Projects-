/**
 * server/src/db/schema.ts
 *
 * Drizzle schema for the NetNest server — the data model from
 * ARCHITECTURE.md. Balances and closes are append-only; Plaid access
 * tokens are stored as AES-256-GCM ciphertext only.
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

export const nests = pgTable("nests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["free", "plus"] }).notNull().default("free"),
  rcAppUserId: text("rc_app_user_id"),
  timezone: text("timezone").notNull().default("America/New_York"),
  /** jsonb: { closeDay: number, currency: "USD" } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nestId: uuid("nest_id").notNull().references(() => nests.id),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role", { enum: ["owner", "partner"] }).notNull().default("owner"),
    magicTokenHash: text("magic_token_hash"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("members_email_idx").on(t.email)],
);

/** Plaid items; access tokens at rest as ciphertext only. */
export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nestId: uuid("nest_id").notNull().references(() => nests.id),
    memberId: uuid("member_id").notNull().references(() => members.id),
    plaidItemId: text("plaid_item_id").notNull(),
    accessTokenCiphertext: text("access_token_ciphertext").notNull(),
    institutionName: text("institution_name").notNull(),
    status: text("status", { enum: ["ok", "reauth_needed", "removed"] })
      .notNull()
      .default("ok"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("institutions_item_idx").on(t.plaidItemId)],
);

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  nestId: uuid("nest_id").notNull().references(() => nests.id),
  institutionId: uuid("institution_id").references(() => institutions.id),
  kind: text("kind", {
    enum: [
      "checking",
      "savings",
      "brokerage",
      "retirement",
      "credit",
      "mortgage",
      "loan",
      "property",
      "vehicle",
      "valuable",
      "other_asset",
      "other_debt",
    ],
  }).notNull(),
  name: text("name").notNull(),
  isDebt: boolean("is_debt").notNull().default(false),
  plaidAccountId: text("plaid_account_id"),
  manual: boolean("manual").notNull().default(false),
  status: text("status", { enum: ["active", "hidden", "closed"] })
    .notNull()
    .default("active"),
  ...timestamps,
});

/** Append-only; history never rewritten. */
export const balances = pgTable(
  "balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    asOf: date("as_of").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    source: text("source", { enum: ["plaid", "manual", "close"] }).notNull(),
    ...timestamps,
  },
  (t) => [index("balances_account_asof_idx").on(t.accountId, t.asOf)],
);

/** The monthly ritual; a closed month is immutable. */
export const closes = pgTable(
  "closes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nestId: uuid("nest_id").notNull().references(() => nests.id),
    month: date("month").notNull(),
    netWorthCents: integer("net_worth_cents").notNull(),
    assetsCents: integer("assets_cents").notNull(),
    debtsCents: integer("debts_cents").notNull(),
    note: text("note"),
    closedBy: uuid("closed_by").references(() => members.id),
    closedAt: timestamp("closed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("closes_nest_month_idx").on(t.nestId, t.month)],
);

/** Plaid + RevenueCat idempotency ledger. */
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", { enum: ["plaid", "revenuecat"] }).notNull(),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_provider_external_idx").on(t.provider, t.externalId)],
);

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  nestId: uuid("nest_id").notNull().references(() => nests.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
