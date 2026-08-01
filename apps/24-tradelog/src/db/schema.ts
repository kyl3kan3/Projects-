/**
 * Drizzle schema (see ARCHITECTURE.md).
 *
 * ## Derived vs authored
 *
 * `executions` and everything a trader wrote down are **authored**: they are the
 * record, and nothing but the user or their broker may change them.
 * `trades` and `trade_executions` are **derived**: they are recomputed from the
 * whole account's executions on every import (see lib/pipeline.ts), so they are
 * upserted on `(account_id, match_key)` and never edited by hand.
 *
 * The one wrinkle that follows: a trade's authored columns (`setup_id`,
 * `stop_price`, `notes`, `emotion_tags`, `reviewed`) live on the trade row and
 * are deliberately excluded from the rebuild's SET list, so a rebuild keeps them.
 * If a *newly imported earlier fill* changes when a trade opened, its match key
 * changes and the annotations do not follow — a rare case, and the alternative
 * (keying notes to a single fill) is worse.
 */

import {
  boolean,
  customType,
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
import { cents, money, price, qty, scaled4 } from "@/db/columns";
import type { AssetClass } from "@/lib/instruments";
import type { Direction, LegRole, Side } from "@/lib/matcher";
import type { FindingKind } from "@/lib/leaks";

/* ----------------------------------------------------------------- types --- */

export type PlanId = "free" | "trader" | "pro";
export type TradeStatus = "open" | "closed";
export type ImportSource = "upload" | "paste" | "sync";

/** The emotion vocabulary. Labels in hairline chips — never faces (DESIGN.md). */
export const EMOTION_TAGS = [
  "PLANNED",
  "FOMO",
  "REVENGE",
  "HESITATED",
  "IMPATIENT",
  "DISCIPLINED",
  "TILTED",
  "BORED",
] as const;
export type EmotionTag = (typeof EMOTION_TAGS)[number];

/** Setup swatches, drawn only from DESIGN.md's palette. No purple, ever. */
export const SETUP_COLORS = ["blue", "leak", "profit", "loss", "text-2", "paper"] as const;
export type SetupColor = (typeof SETUP_COLORS)[number];

/** Row-level import errors, shown verbatim in the import report. */
export interface StoredRowError {
  rowNumber: number;
  message: string;
  raw: string;
}

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ----------------------------------------------------------------- users --- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  /**
   * IANA zone. Every time-of-day statistic in the app is computed in it, so it
   * is a first-class setting rather than a display preference.
   */
  timezone: text("timezone").notNull().default("America/New_York"),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------------- accounts --- */

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Parser id from lib/parsers/registry, or "manual". */
    broker: text("broker").notNull(),
    label: text("label").notNull(),
    currency: text("currency").notNull().default("USD"),
    /**
     * IBKR Flex Web Service credentials, encrypted at rest with
     * SYNC_CREDS_ENCRYPTION_KEY. Null for CSV-only accounts.
     */
    syncSecretEncrypted: text("sync_secret_encrypted"),
    syncQueryId: text("sync_query_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

/* -------------------------------------------------------- import batches --- */

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    byteSize: integer("byte_size").notNull().default(0),
    source: text("source").$type<ImportSource>().notNull().default("upload"),
    parserId: text("parser_id").notNull(),
    /** Recorded so a batch parsed by a since-fixed parser is identifiable. */
    parserVersion: text("parser_version").notNull(),
    totalRows: integer("total_rows").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errors: jsonb("errors").$type<StoredRowError[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_batches_account_idx").on(t.accountId, t.createdAt)],
);

/* ------------------------------------------------------------ executions --- */

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    /** Canonical symbol; options use the pipe form from lib/instruments. */
    symbol: text("symbol").notNull(),
    displaySymbol: text("display_symbol").notNull(),
    assetClass: text("asset_class").$type<AssetClass>().notNull(),
    side: text("side").$type<Side>().notNull(),
    qty: qty("qty").notNull(),
    price: price("price").notNull(),
    /** Exact, at the internal money scale — sub-cent fees survive storage. */
    fees: money("fees").notNull(),
    multiplierMilli: integer("multiplier_milli").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    brokerRef: text("broker_ref"),
    /** Import idempotency; see lib/pipeline.ts `dedupeHash`. */
    dedupeHash: text("dedupe_hash").notNull(),
    /** Row number in the source file, for the import report. */
    sourceRow: integer("source_row"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("executions_dedupe_idx").on(t.accountId, t.dedupeHash),
    index("executions_account_time_idx").on(t.accountId, t.executedAt),
    index("executions_symbol_idx").on(t.accountId, t.symbol, t.executedAt),
  ],
);

/* ---------------------------------------------------------------- trades --- */

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Stable derivation key: assetClass:symbol:direction:openedAt. */
    matchKey: text("match_key").notNull(),

    symbol: text("symbol").notNull(),
    displaySymbol: text("display_symbol").notNull(),
    assetClass: text("asset_class").$type<AssetClass>().notNull(),
    direction: text("direction").$type<Direction>().notNull(),
    multiplierMilli: integer("multiplier_milli").notNull(),

    openedAt: timestamp("opened_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    status: text("status").$type<TradeStatus>().notNull(),
    holdSeconds: integer("hold_seconds"),

    qtyOpened: qty("qty_opened").notNull(),
    qtyMax: qty("qty_max").notNull(),
    qtyOpen: qty("qty_open").notNull(),
    avgEntry: price("avg_entry").notNull(),
    avgExit: price("avg_exit"),

    grossPnlCents: cents("gross_pnl_cents").notNull(),
    feesCents: cents("fees_cents").notNull(),
    netPnlCents: cents("net_pnl_cents").notNull(),
    positionCostCents: cents("position_cost_cents").notNull(),

    /** Mark used for the unrealised figure — the last fill we have seen. */
    markPrice: price("mark_price"),
    unrealizedPnlCents: cents("unrealized_pnl_cents"),

    // --- authored: excluded from the rebuild's SET list ---
    setupId: uuid("setup_id"),
    stopPrice: price("stop_price"),
    /** Net P&L ÷ initial risk, scaled by 1e4. Recomputed when the stop changes. */
    rMultiple: scaled4("r_multiple"),
    notes: text("notes"),
    emotionTags: text("emotion_tags").array().$type<EmotionTag[]>().notNull().default([]),
    reviewed: boolean("reviewed").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("trades_match_idx").on(t.accountId, t.matchKey),
    index("trades_user_closed_idx").on(t.userId, t.closedAt),
    index("trades_account_opened_idx").on(t.accountId, t.openedAt),
    index("trades_setup_idx").on(t.setupId),
  ],
);

/** The matching audit trail: which fill closed which trade, and for how much. */
export const tradeExecutions = pgTable(
  "trade_executions",
  {
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    role: text("role").$type<LegRole>().notNull(),
    /** The portion of the fill allocated to this trade — a split fill has two. */
    qty: qty("qty").notNull(),
    price: price("price").notNull(),
    feesCents: cents("fees_cents").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull(),
    seq: integer("seq").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tradeId, t.executionId, t.seq] }),
    index("trade_executions_execution_idx").on(t.executionId),
  ],
);

/* ---------------------------------------------------------------- setups --- */

export const setups = pgTable(
  "setups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rulesNotes: text("rules_notes"),
    color: text("color").$type<SetupColor>().notNull().default("blue"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("setups_user_name_idx").on(t.userId, t.name)],
);

/* ----------------------------------------------------------- chart images --- */

/**
 * Chart snapshots live in Postgres as bytes.
 *
 * ARCHITECTURE.md names S3/R2, and at volume that is right. At MVP a bucket is
 * one unverifiable dependency in front of a feature that has to work on day one,
 * so the bytes go in `bytea` behind an authenticated route, capped per image.
 * Swapping in R2 later touches this table and one route; the product does not move.
 */
export const tradeImages = pgTable(
  "trade_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tradeId: uuid("trade_id")
      .notNull()
      .references(() => trades.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    caption: text("caption"),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trade_images_trade_idx").on(t.tradeId)],
);

/* -------------------------------------------------------------- findings --- */

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<FindingKind>().notNull(),
    statement: text("statement").notNull(),
    detail: text("detail").notNull(),
    dollarImpactCents: cents("dollar_impact_cents").notNull(),
    /** Null until there is at least a month of history to rate it over. */
    monthlyImpactCents: cents("monthly_impact_cents"),
    sampleSize: integer("sample_size").notNull(),
    /** The trades behind the finding: the evidence list and the counterfactual. */
    tradeIds: uuid("trade_ids").array().notNull().default([]),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    rank: integer("rank").notNull().default(0),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    /** "Watch this pattern" — puts a guardrail chip on the dashboard. */
    watching: boolean("watching").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("findings_user_kind_idx").on(t.userId, t.kind),
    index("findings_user_rank_idx").on(t.userId, t.rank),
  ],
);

/* --------------------------------------------------------- weekly reviews --- */

export const weeklyReviews = pgTable(
  "weekly_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Monday of the week, as a local date key ("2026-01-12"). */
    weekStart: text("week_start").notNull(),
    wentWell: text("went_well"),
    wentWrong: text("went_wrong"),
    oneChange: text("one_change"),
    /** The finding the trader chose to answer this week. */
    findingKind: text("finding_kind").$type<FindingKind>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weekly_reviews_user_week_idx").on(t.userId, t.weekStart)],
);

/* --------------------------------------------------------------- billing --- */

export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  plan: text("plan").$type<PlanId>().notNull(),
  status: text("status").notNull(),
  interval: text("interval").$type<"month" | "year">(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------- inferred types --- */

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type TradeExecution = typeof tradeExecutions.$inferSelect;
export type Setup = typeof setups.$inferSelect;
export type TradeImage = typeof tradeImages.$inferSelect;
export type FindingRow = typeof findings.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type WeeklyReview = typeof weeklyReviews.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
