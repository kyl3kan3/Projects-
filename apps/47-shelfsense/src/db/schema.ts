/**
 * Drizzle ORM schema — the data model from ARCHITECTURE.md, one table per
 * bullet. Migrations are generated from this file (`npm run db:generate`).
 *
 * Two conventions worth knowing before reading:
 *
 *  - **Money is integer cents, everywhere.** Never a float, never a numeric the
 *    driver hands back as a string. Rounding happens once, at the edge that
 *    produces the cents.
 *  - **Tenancy is `shop_id` on every domain table**, including the ones that
 *    could reach it through a join (variants, forecasts). A forecast query that
 *    has to join four tables to find out whose row it is will eventually be
 *    written without the join.
 *
 * Velocities are `doublePrecision`: they are rates, not money, and rounding them
 * to integers would quantise a 0.4/day SKU to either 0 (never reorder) or 1
 * (order three times too much).
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
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

/* ------------------------------------------------------------------ enums --- */

export const planEnum = pgEnum("plan", ["counter", "backroom", "warehouse"]);
export const forecastStatusEnum = pgEnum("forecast_status", [
  "order_now",
  "order_soon",
  "healthy",
  "overstocked",
  "dead",
]);
export const poDraftStatusEnum = pgEnum("po_draft_status", ["draft", "sent", "dismissed"]);
export const alertKindEnum = pgEnum("alert_kind", ["stockout_risk", "dead_stock"]);
export const trendEnum = pgEnum("trend", ["rising", "flat", "falling"]);
export const confidenceEnum = pgEnum("confidence", ["high", "medium", "low"]);
export const digestKindEnum = pgEnum("digest_kind", ["weekly_reorder", "monthly_dead_stock"]);

export type Plan = (typeof planEnum.enumValues)[number];
export type ForecastStatus = (typeof forecastStatusEnum.enumValues)[number];
export type PoDraftStatus = (typeof poDraftStatusEnum.enumValues)[number];
export type AlertKind = (typeof alertKindEnum.enumValues)[number];
export type Trend = (typeof trendEnum.enumValues)[number];
export type Confidence = (typeof confidenceEnum.enumValues)[number];
export type DigestKind = (typeof digestKindEnum.enumValues)[number];

/* --------------------------------------------------------------- settings --- */

/** Per-shop forecast settings. Defaults live in lib/settings.ts. */
export interface ShopSettings {
  /** Buffer beyond lead time that the reorder point must cover. */
  safetyDays: number;
  /** Lead time used for a variant whose supplier is unknown. */
  defaultLeadTimeDays: number;
  /** How much cover a suggested PO quantity aims to buy, beyond lead + safety. */
  coverTargetDays: number;
  /** Days of cover above which a still-selling SKU counts as overstocked. */
  overstockCoverDays: number;
  /** Days of cover above which a SKU counts as dead. */
  deadCoverDays: number;
  /** Order-by within this many days => "order this week". */
  orderSoonDays: number;
  /** Horizon for the revenue-at-risk headline. */
  riskHorizonDays: number;
  /** 1 = Monday … 7 = Sunday. The weekly digest goes out on this weekday. */
  digestWeekday: number;
  weeklyDigestEnabled: boolean;
  monthlyDeadStockEnabled: boolean;
}

/**
 * The audit trail persisted on every forecast row and rendered verbatim by the
 * "show the math" panel. Every number the UI displays as an input comes from
 * here — the screen never recomputes, so what the merchant audits is exactly
 * what the engine used.
 */
export interface ForecastInputs {
  asOf: string;
  velocity7d: number;
  velocity30d: number;
  velocity90d: number;
  blendedVelocity: number;
  /** Per-window: units, days actually counted, days dropped as stockouts. */
  windows: {
    windowDays: number;
    units: number;
    observedDays: number;
    censoredDays: number;
    velocity: number;
    hasData: boolean;
  }[];
  weights: { w7: number; w30: number; w90: number };
  leadTimeDays: number;
  leadTimeSource: "supplier" | "default";
  safetyDays: number;
  coverTargetDays: number;
  moq: number;
  packSize: number;
  available: number;
  priceCents: number;
  costCents: number | null;
  trend: Trend;
  confidence: Confidence;
  /** History length in observed (non-stockout) days across the 90-day window. */
  observedDays: number;
  /** True when every window was censored by stockouts — demand is unknown, not zero. */
  demandCensored: boolean;
  notes: string[];
}

/* ------------------------------------------------------------- merchants --- */

/**
 * The person who signs in.
 *
 * ARCHITECTURE.md says "Shopify session tokens, no separate auth system", and
 * inside the admin iframe that is what happens. But the MVP also emails weekly
 * and monthly digests, and a link in an email opens a browser with no Shopify
 * session — so there has to be an account the merchant can sign into directly.
 * The Shopify install links to (or creates) one of these rather than inventing a
 * second identity.
 */
export const merchants = pgTable(
  "merchants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("merchants_email_key").on(t.email)],
);

/* ----------------------------------------------------------------- shops --- */

export const shops = pgTable(
  "shops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    shopifyDomain: text("shopify_domain").notNull(),
    name: text("name").notNull(),
    email: text("email"),
    /** AES-256-GCM envelope, never plaintext. Null once uninstalled. */
    accessToken: text("access_token"),
    shopifyScopes: text("shopify_scopes"),
    plan: planEnum("plan").notNull().default("counter"),
    shopifyChargeId: text("shopify_charge_id"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("UTC"),
    currency: text("currency").notNull().default("USD"),
    skuCount: integer("sku_count").notNull().default(0),
    /** Cursor + counters for the resumable 90-day backfill. */
    backfillCursor: text("backfill_cursor"),
    backfillOrdersImported: integer("backfill_orders_imported").notNull().default(0),
    backfillOrdersEstimated: integer("backfill_orders_estimated"),
    backfillStartedAt: timestamp("backfill_started_at", { withTimezone: true }),
    backfillCompletedAt: timestamp("backfill_completed_at", { withTimezone: true }),
    lastRecomputeAt: timestamp("last_recompute_at", { withTimezone: true }),
    lastRecomputeDate: date("last_recompute_date"),
    uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),
    /** True for the labelled sample store used to demo the product. */
    isDemo: boolean("is_demo").notNull().default(false),
    settings: jsonb("settings").$type<Partial<ShopSettings>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shops_domain_key").on(t.shopifyDomain),
    index("shops_merchant_idx").on(t.merchantId),
  ],
);

/* ------------------------------------------------------------- suppliers --- */

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    leadTimeDays: integer("lead_time_days").notNull().default(14),
    minOrderValueCents: integer("min_order_value_cents").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_shop_idx").on(t.shopId),
    uniqueIndex("suppliers_shop_name_key").on(t.shopId, t.name),
  ],
);

/* -------------------------------------------------------------- products --- */

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    shopifyProductId: text("shopify_product_id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    vendor: text("vendor"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("products_shop_shopify_key").on(t.shopId, t.shopifyProductId)],
);

/* -------------------------------------------------------------- variants --- */

/** The forecasting unit. One row per SKU. */
export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    shopifyVariantId: text("shopify_variant_id").notNull(),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    costCents: integer("cost_cents"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    moq: integer("moq").notNull().default(0),
    packSize: integer("pack_size").notNull().default(1),
    inventoryQuantity: integer("inventory_quantity").notNull().default(0),
    tracked: boolean("tracked").notNull().default(true),
    /** Set by the merchant from a SKU row; suppresses alerts and PO suggestions. */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    /** Earliest sales_daily date we have for this variant — the history floor. */
    firstSaleOn: date("first_sale_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("variants_shop_shopify_key").on(t.shopId, t.shopifyVariantId),
    index("variants_shop_sku_idx").on(t.shopId, t.sku),
    index("variants_supplier_idx").on(t.supplierId),
    index("variants_product_idx").on(t.productId),
  ],
);

/* ------------------------------------------------------- inventory levels --- */

export const inventoryLevels = pgTable(
  "inventory_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    shopifyLocationId: text("shopify_location_id").notNull(),
    available: integer("available").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inventory_variant_location_key").on(t.variantId, t.shopifyLocationId)],
);

/* ----------------------------------------------------------- order lines --- */

/**
 * One row per (order, variant): the ledger `sales_daily` is rolled up from.
 *
 * The obvious design — have the webhook add its units straight onto the day's
 * total — is wrong twice over. Replaying `orders/create` would double-count, and
 * `orders/updated` (a refund, a removed line, a cancellation) has no way to undo
 * what an earlier delivery added. Keeping the line ledger makes both correct by
 * construction: an order is *upserted* to its current state and the affected days
 * are recomputed from the ledger, so delivering the same webhook five times and
 * delivering five different versions of it both end up right.
 */
export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    /** Shopify's order id, as a string. */
    externalOrderId: text("external_order_id").notNull(),
    /** Calendar day in the shop's timezone. */
    date: date("date").notNull(),
    units: integer("units").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("order_lines_order_variant_key").on(t.shopId, t.externalOrderId, t.variantId),
    index("order_lines_variant_date_idx").on(t.variantId, t.date),
  ],
);

/* ------------------------------------------------------------ sales_daily --- */

/**
 * The velocity spine: one row per variant per day.
 *
 * `stockout` is the load-bearing column. A day on which the variant had nothing
 * to sell is a *censored observation*, not a zero — including it in the
 * denominator is how forecasting tools decide a best-seller is dead.
 */
export const salesDaily = pgTable(
  "sales_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    unitsSold: integer("units_sold").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    stockout: boolean("stockout").notNull().default(false),
  },
  (t) => [
    uniqueIndex("sales_daily_variant_date_key").on(t.variantId, t.date),
    index("sales_daily_shop_date_idx").on(t.shopId, t.date),
  ],
);

/* ------------------------------------------------------------- forecasts --- */

export const forecasts = pgTable(
  "forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    runDate: date("run_date").notNull(),
    velocity7d: doublePrecision("velocity_7d").notNull().default(0),
    velocity30d: doublePrecision("velocity_30d").notNull().default(0),
    velocity90d: doublePrecision("velocity_90d").notNull().default(0),
    blendedVelocity: doublePrecision("blended_velocity").notNull().default(0),
    /** Null means "never runs out at the current rate" — not zero, not Infinity. */
    daysOfCover: doublePrecision("days_of_cover"),
    reorderPoint: integer("reorder_point").notNull().default(0),
    reorderQty: integer("reorder_qty").notNull().default(0),
    orderByDate: date("order_by_date"),
    stockoutDate: date("stockout_date"),
    revenueAtRiskCents: integer("revenue_at_risk_cents").notNull().default(0),
    cashTiedUpCents: integer("cash_tied_up_cents").notNull().default(0),
    available: integer("available").notNull().default(0),
    status: forecastStatusEnum("status").notNull(),
    trend: trendEnum("trend").notNull().default("flat"),
    confidence: confidenceEnum("confidence").notNull().default("low"),
    inputs: jsonb("inputs").$type<ForecastInputs>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("forecasts_variant_run_key").on(t.variantId, t.runDate),
    index("forecasts_shop_run_status_idx").on(t.shopId, t.runDate, t.status),
  ],
);

/* ------------------------------------------------------------- po drafts --- */

export const poDrafts = pgTable(
  "po_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** Denormalised so a sent PO still reads correctly if the supplier is deleted. */
    supplierName: text("supplier_name").notNull(),
    status: poDraftStatusEnum("status").notNull().default("draft"),
    leadTimeDays: integer("lead_time_days").notNull().default(14),
    lineCount: integer("line_count").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentToEmail: text("sent_to_email"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    /**
     * Variants on this draft are not re-suggested until this instant. Pinned to
     * a fixed distance from the send/dismiss (one lead time), so a draft cannot
     * suppress its SKUs forever.
     */
    suppressUntil: timestamp("suppress_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("po_drafts_shop_status_idx").on(t.shopId, t.status),
    index("po_drafts_supplier_idx").on(t.supplierId),
  ],
);

export const poDraftLines = pgTable(
  "po_draft_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    poDraftId: uuid("po_draft_id")
      .notNull()
      .references(() => poDrafts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    suggestedQty: integer("suggested_qty").notNull(),
    finalQty: integer("final_qty").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
  },
  (t) => [
    uniqueIndex("po_draft_lines_draft_variant_key").on(t.poDraftId, t.variantId),
    index("po_draft_lines_variant_idx").on(t.variantId),
  ],
);

/* ---------------------------------------------------------------- alerts --- */

/**
 * The dedup ledger. One open row per (variant, kind); a notification is only
 * sent on the transition into the state, never because the state is still true.
 * The partial unique index is what makes "raise if not already open" a single
 * atomic upsert instead of a read-then-write race.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    kind: alertKindEnum("kind").notNull(),
    firstRaisedAt: timestamp("first_raised_at", { withTimezone: true }).notNull().defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /**
     * Uniqueness key for "one open alert per variant per kind": carries the
     * variant id while the alert is open and is nulled on resolve, so Postgres
     * lets the same variant raise the same kind again later.
     */
    openVariantId: uuid("open_variant_id"),
  },
  (t) => [
    uniqueIndex("alerts_open_key").on(t.openVariantId, t.kind),
    index("alerts_shop_kind_idx").on(t.shopId, t.kind, t.resolvedAt),
  ],
);

/* -------------------------------------------------------- webhook events --- */

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").references(() => shops.id, { onDelete: "cascade" }),
    shopDomain: text("shop_domain").notNull(),
    shopifyWebhookId: text("shopify_webhook_id").notNull(),
    topic: text("topic").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("webhook_events_shopify_id_key").on(t.shopifyWebhookId),
    index("webhook_events_pending_idx").on(t.processedAt, t.receivedAt),
  ],
);

/* ---------------------------------------------------------- digest sends --- */

/**
 * One row per digest actually sent, keyed by the *period* it covers.
 *
 * This is the guard against the failure mode where a state that stays true
 * ("this SKU is still dead") mails the merchant every single day: a digest is
 * pinned to a period, and a period can only be sent once.
 */
export const digestSends = pgTable(
  "digest_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id, { onDelete: "cascade" }),
    kind: digestKindEnum("kind").notNull(),
    /** "2026-W31" for weekly, "2026-07" for monthly. */
    periodKey: text("period_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    /** True when DRY_RUN or no Resend key meant nothing left the building. */
    suppressed: boolean("suppressed").notNull().default(false),
  },
  (t) => [uniqueIndex("digest_sends_period_key").on(t.shopId, t.kind, t.periodKey)],
);

/* ------------------------------------------------------------- relations --- */

export const merchantsRelations = relations(merchants, ({ many }) => ({
  shops: many(shops),
}));

export const shopsRelations = relations(shops, ({ one, many }) => ({
  merchant: one(merchants, { fields: [shops.merchantId], references: [merchants.id] }),
  suppliers: many(suppliers),
  products: many(products),
  variants: many(variants),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  shop: one(shops, { fields: [products.shopId], references: [shops.id] }),
  variants: many(variants),
}));

export const variantsRelations = relations(variants, ({ one, many }) => ({
  shop: one(shops, { fields: [variants.shopId], references: [shops.id] }),
  product: one(products, { fields: [variants.productId], references: [products.id] }),
  supplier: one(suppliers, { fields: [variants.supplierId], references: [suppliers.id] }),
  sales: many(salesDaily),
  forecasts: many(forecasts),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  shop: one(shops, { fields: [suppliers.shopId], references: [shops.id] }),
  variants: many(variants),
  drafts: many(poDrafts),
}));

export const poDraftsRelations = relations(poDrafts, ({ one, many }) => ({
  shop: one(shops, { fields: [poDrafts.shopId], references: [shops.id] }),
  supplier: one(suppliers, { fields: [poDrafts.supplierId], references: [suppliers.id] }),
  lines: many(poDraftLines),
}));

export const poDraftLinesRelations = relations(poDraftLines, ({ one }) => ({
  draft: one(poDrafts, { fields: [poDraftLines.poDraftId], references: [poDrafts.id] }),
  variant: one(variants, { fields: [poDraftLines.variantId], references: [variants.id] }),
}));

/* ----------------------------------------------------------------- types --- */

export type Merchant = typeof merchants.$inferSelect;
export type Shop = typeof shops.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type SalesDay = typeof salesDaily.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Forecast = typeof forecasts.$inferSelect;
export type PoDraft = typeof poDrafts.$inferSelect;
export type PoDraftLine = typeof poDraftLines.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type DigestSend = typeof digestSends.$inferSelect;
