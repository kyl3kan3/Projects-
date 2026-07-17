/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all PriceProbe tables -- the single source of
 * truth for the data model described in ARCHITECTURE.md ("Data Model").
 * This schema is complete and real: migrate it as-is with drizzle-kit.
 *
 * Tenancy convention: everything hangs off brands.id, directly or through
 * products -- EXCEPT scrape_domains, which is deliberately shared across
 * brands (politeness is global). Snapshots are append-only.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const planEnum = pgEnum("plan", ["watch", "desk", "floor"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "member"]);
export const productStatusEnum = pgEnum("product_status", [
  "active",
  "archived",
]);
export const extractionMethodEnum = pgEnum("extraction_method", [
  "structured",
  "selector",
  "manual",
]);
export const pageStatusEnum = pgEnum("page_status", [
  "ok",
  "warning",
  "blocked",
  "paused",
]);
export const changeKindEnum = pgEnum("change_kind", [
  "price_drop",
  "price_rise",
  "back_in_stock",
  "out_of_stock",
  "first_read",
]);
export const alertRuleKindEnum = pgEnum("alert_rule_kind", [
  "any_change",
  "undercut",
  "map_floor",
  "margin_floor",
  "stock_gap",
]);
export const alertChannelEnum = pgEnum("alert_channel", ["email", "slack"]);
export const alertStatusEnum = pgEnum("alert_status", [
  "queued",
  "sent",
  "failed",
]);
export const suggestionRuleEnum = pgEnum("suggestion_rule", [
  "match_lowest",
  "median_band",
  "floor_guard",
]);
export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "open",
  "accepted",
  "dismissed",
  "stale",
]);

// ---------------------------------------------------------------------------
// Tenant root
// ---------------------------------------------------------------------------

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("watch"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  slackWebhookUrl: text("slack_webhook_url"),
  // { digestHour, noiseThresholdPct, currency }
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_ux").on(t.email)],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    skuCode: text("sku_code"),
    yourPriceCents: integer("your_price_cents").notNull(),
    costFloorCents: integer("cost_floor_cents"),
    currency: text("currency").notNull().default("USD"),
    productUrl: text("product_url"),
    shopifyProductId: text("shopify_product_id"),
    flagged: boolean("flagged").notNull().default(false),
    status: productStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("products_brand_ix").on(t.brandId, t.status)],
);

// ---------------------------------------------------------------------------
// Scraping -- domains are shared across brands (politeness is global)
// ---------------------------------------------------------------------------

export const scrapeDomains = pgTable(
  "scrape_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    minIntervalSeconds: integer("min_interval_seconds").notNull().default(900),
    // { fetchedAt, disallows: string[] }
    robotsState: jsonb("robots_state").notNull().default({}),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    // { priceSelectors: string[], stockSelectors: string[] }
    selectorPack: jsonb("selector_pack").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("scrape_domains_domain_ux").on(t.domain)],
);

export const competitorPages = pgTable(
  "competitor_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => scrapeDomains.id),
    label: text("label").notNull(),
    extractionMethod: extractionMethodEnum("extraction_method")
      .notNull()
      .default("structured"),
    lastSnapshotId: uuid("last_snapshot_id"),
    status: pageStatusEnum("status").notNull().default("ok"),
    statusNote: text("status_note"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("competitor_pages_product_ix").on(t.productId),
    index("competitor_pages_due_ix").on(t.nextCheckAt),
    uniqueIndex("competitor_pages_product_url_ux").on(t.productId, t.url),
  ],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorPageId: uuid("competitor_page_id")
      .notNull()
      .references(() => competitorPages.id, { onDelete: "cascade" }),
    priceCents: integer("price_cents"), // null = unreadable
    currency: text("currency").notNull().default("USD"),
    inStock: boolean("in_stock"),
    // { method, matchedSelector?, jsonLdType?, rawPriceString }
    rawExtract: jsonb("raw_extract").notNull().default({}),
    contentHash: text("content_hash"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("snapshots_page_time_ix").on(t.competitorPageId, t.fetchedAt)],
);

// ---------------------------------------------------------------------------
// Changes, alerts, suggestions
// ---------------------------------------------------------------------------

export const changeEvents = pgTable(
  "change_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitorPageId: uuid("competitor_page_id")
      .notNull()
      .references(() => competitorPages.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    kind: changeKindEnum("kind").notNull(),
    oldPriceCents: integer("old_price_cents"),
    newPriceCents: integer("new_price_cents"),
    oldInStock: boolean("old_in_stock"),
    newInStock: boolean("new_in_stock"),
    positionBefore: integer("position_before"),
    positionAfter: integer("position_after"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("change_events_page_time_ux").on(
      t.competitorPageId,
      t.occurredAt,
    ),
    index("change_events_brand_time_ix").on(t.brandId, t.occurredAt),
  ],
);

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id), // null = all
    kind: alertRuleKindEnum("kind").notNull(),
    // { pct?: number, cents?: number }
    threshold: jsonb("threshold").notNull().default({}),
    channels: jsonb("channels").notNull().default(["email"]),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("alert_rules_brand_ix").on(t.brandId)],
);

export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertRuleId: uuid("alert_rule_id").references(() => alertRules.id),
    changeEventId: uuid("change_event_id").references(() => changeEvents.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    channel: alertChannelEnum("channel").notNull(),
    status: alertStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("alert_events_brand_ix").on(t.brandId, t.occurredAt)],
);

export const suggestions = pgTable(
  "suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    rule: suggestionRuleEnum("rule").notNull(),
    suggestedPriceCents: integer("suggested_price_cents").notNull(),
    // Rendered verbatim in the UI -- there is no score without reasons.
    reasoning: text("reasoning").notNull(),
    // { rivals: [{ label, priceCents }], median, lowest }
    basis: jsonb("basis").notNull().default({}),
    status: suggestionStatusEnum("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("suggestions_product_status_ix").on(t.productId, t.status)],
);

// ---------------------------------------------------------------------------
// Webhook idempotency, audit
// ---------------------------------------------------------------------------

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("stripe"),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_external_ux").on(t.provider, t.externalId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(), // "user:<id>" | "system"
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_brand_ix").on(t.brandId, t.occurredAt)],
);
