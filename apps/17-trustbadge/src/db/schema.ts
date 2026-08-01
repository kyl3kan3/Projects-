/**
 * Drizzle schema for TrustBadge — the data model in ARCHITECTURE.md.
 *
 * Merchant 1—N Store 1—N Order 1—N ReviewRequest; Review N—1 Store and
 * optionally N—1 Order/ReviewRequest; Review 1—N ReviewMedia; Store 1—N Widget
 * 1—1 WidgetSettings; Merchant 1—1 Subscription.
 *
 * Read-path note: the widget's reviews JSON is the only query that runs at
 * storefront scale, so `reviews` carries a composite index on
 * (store, status, product) — every widget read is exactly that shape.
 */

import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ----------------------------------------------------------------- types --- */

export type Tier = "free" | "starter" | "growth" | "pro";
export type Platform = "shopify" | "woocommerce" | "script_tag";
export type OrderStatus = "pending" | "fulfilled" | "cancelled" | "refunded";
export type RequestChannel = "email" | "sms";
export type RequestStatus =
  | "scheduled"
  | "sent"
  | "opened"
  | "submitted"
  | "bounced"
  | "cancelled";
export type ReviewStatus = "pending" | "approved" | "rejected";
export type ReviewSource =
  | "native"
  | "import_csv"
  | "import_judgeme"
  | "import_loox"
  | "import_amazon"
  | "import_etsy"
  | "import_google";
export type MediaKind = "photo" | "video";
export type ModerationStatus = "pending" | "approved" | "rejected";
export type WidgetType = "wall" | "carousel" | "badge" | "stars";
export type ImportStatus = "pending" | "running" | "complete" | "failed";

/** A line item as ingested from the cart platform. */
export interface LineItem {
  externalId: string;
  title: string;
  quantity: number;
  imageUrl?: string;
}

/** Per-widget theme tokens. Defaults live in src/lib/widgets.ts. */
export interface WidgetTheme {
  starColor: string;
  radius: number;
  font: "merchant" | "trustbadge";
  motion: boolean;
}

export interface WidgetLayout {
  maxReviews: number;
  showPhotos: boolean;
  showReplies: boolean;
}

/** Postgres bytea, for the development-mode media store. */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

/* ------------------------------------------------------------- merchants --- */

export const merchants = pgTable("merchants", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash").notNull(),
  tier: text("tier").$type<Tier>().notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  /**
   * Start of the current metering window. Order counts are always measured from
   * here rather than accumulated in a counter — a counter that drifts silently
   * is a billing dispute waiting to happen.
   */
  periodStartedAt: timestamp("period_started_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* --------------------------------------------------------------- stores --- */

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    platform: text("platform").$type<Platform>().notNull().default("script_tag"),

    /** The widget's public identity. Safe to paste into a storefront theme. */
    publicKey: text("public_key").notNull().unique(),

    // --- Shopify link (null on script-tag / WooCommerce stores) ---
    shopifyShopId: text("shopify_shop_id"),
    shopifyDomain: text("shopify_domain").unique(),
    /** Offline access token, encrypted at rest (see src/lib/crypto.ts). */
    accessToken: text("access_token"),
    shopifyScopes: text("shopify_scopes"),
    uninstalledAt: timestamp("uninstalled_at", { withTimezone: true }),

    // --- request settings ---
    requestDelayDays: integer("request_delay_days").notNull().default(14),
    /**
     * Ratings at or above this auto-publish; below it lands in moderation.
     * Never used to *suppress* a request — anti-gating is a product law
     * (README risk 3), so every order gets the same follow-up regardless.
     */
    autoPublishMinRating: smallint("auto_publish_min_rating").notNull().default(4),
    requestsEnabled: boolean("requests_enabled").notNull().default(true),

    // --- photo incentive ---
    incentiveEnabled: boolean("incentive_enabled").notNull().default(false),
    incentivePercent: smallint("incentive_percent").notNull().default(10),
    incentivePrefix: text("incentive_prefix").notNull().default("THANKS"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stores_merchant_idx").on(t.merchantId)],
);

/* ---------------------------------------------------------------- orders --- */

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    /** The platform's own order id — the dedupe key for webhook replays. */
    externalId: text("external_id").notNull(),
    orderNumber: text("order_number"),
    customerEmail: text("customer_email").notNull(),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    lineItems: jsonb("line_items").$type<LineItem[]>().notNull().default([]),
    status: text("status").$type<OrderStatus>().notNull().default("pending"),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_store_external_idx").on(t.storeId, t.externalId),
    // The metering query: orders for a store since the period started.
    index("orders_store_created_idx").on(t.storeId, t.createdAt),
  ],
);

/* -------------------------------------------------------- review requests --- */

export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    channel: text("channel").$type<RequestChannel>().notNull().default("email"),
    /** The tokenised submission link. Unguessable, single-purpose. */
    token: text("token").notNull().unique(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    status: text("status").$type<RequestStatus>().notNull().default("scheduled"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The cron sweep's only hot query: due, and still scheduled.
    index("review_requests_due_idx").on(t.status, t.scheduledAt),
    index("review_requests_store_idx").on(t.storeId, t.createdAt),
    // One request per order per channel — a webhook replay must not double-send.
    uniqueIndex("review_requests_order_channel_idx").on(t.orderId, t.channel),
  ],
);

/* --------------------------------------------------------------- reviews --- */

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => reviewRequests.id, { onDelete: "set null" }),

    productExternalId: text("product_external_id"),
    productTitle: text("product_title"),

    rating: smallint("rating").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    authorName: text("author_name").notNull(),
    authorEmail: text("author_email"),
    verifiedPurchase: boolean("verified_purchase").notNull().default(false),

    status: text("status").$type<ReviewStatus>().notNull().default("pending"),
    source: text("source").$type<ReviewSource>().notNull().default("native"),

    reply: text("reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),

    incentiveCode: text("incentive_code"),
    /** FTC disclosure text, stored with the review so it can never drift. */
    incentiveDisclosure: text("incentive_disclosure"),

    /** sha256(author|body|date) — how repeated imports stay idempotent. */
    dedupeHash: text("dedupe_hash"),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The widget read path, exactly as it queries.
    index("reviews_store_status_product_idx").on(t.storeId, t.status, t.productExternalId),
    index("reviews_store_created_idx").on(t.storeId, t.createdAt),
    uniqueIndex("reviews_store_dedupe_idx").on(t.storeId, t.dedupeHash),
  ],
);

export const reviewMedia = pgTable(
  "review_media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MediaKind>().notNull().default("photo"),
    /** Object key in R2/S3, or null when the bytes live in `data`. */
    storageKey: text("storage_key"),
    /** Development fallback: the bytes themselves, served from /api/media/<id>. */
    data: bytea("data"),
    contentType: text("content_type").notNull(),
    /** Intrinsic dimensions. Required — the widget needs them for zero CLS. */
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    moderationStatus: text("moderation_status")
      .$type<ModerationStatus>()
      .notNull()
      .default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_media_review_idx").on(t.reviewId)],
);

/* -------------------------------------------------------- discount codes --- */

export const discountCodes = pgTable(
  "discount_codes",
  {
    code: text("code").primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "set null" }),
    percentOff: smallint("percent_off").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  },
  (t) => [index("discount_codes_store_idx").on(t.storeId)],
);

/* --------------------------------------------------------------- widgets --- */

export const widgets = pgTable(
  "widgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    type: text("type").$type<WidgetType>().notNull(),
    name: text("name").notNull(),
    /** Reserved for Pro A/B testing (post-MVP); one group at MVP. */
    abGroup: text("ab_group"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("widgets_store_idx").on(t.storeId)],
);

export const widgetSettings = pgTable("widget_settings", {
  widgetId: uuid("widget_id")
    .primaryKey()
    .references(() => widgets.id, { onDelete: "cascade" }),
  theme: jsonb("theme").$type<WidgetTheme>().notNull(),
  layout: jsonb("layout").$type<WidgetLayout>().notNull(),
  showBranding: boolean("show_branding").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Daily impression rollup — what "widget impressions" on the dashboard reads. */
export const widgetImpressions = pgTable(
  "widget_impressions",
  {
    widgetId: uuid("widget_id")
      .notNull()
      .references(() => widgets.id, { onDelete: "cascade" }),
    /** UTC date, midnight-aligned. */
    day: timestamp("day", { withTimezone: true }).notNull(),
    impressions: integer("impressions").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.widgetId, t.day] })],
);

/* ----------------------------------------------------------- import jobs --- */

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    source: text("source").$type<ReviewSource>().notNull(),
    fileName: text("file_name").notNull(),
    status: text("status").$type<ImportStatus>().notNull().default("pending"),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    skippedRows: integer("skipped_rows").notNull().default(0),
    errorLog: jsonb("error_log").$type<{ row: number; reason: string }[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("import_jobs_store_idx").on(t.storeId, t.createdAt)],
);

/* --------------------------------------------------------------- billing --- */

export const subscriptions = pgTable("subscriptions", {
  merchantId: uuid("merchant_id")
    .primaryKey()
    .references(() => merchants.id, { onDelete: "cascade" }),
  stripeSubscriptionId: text("stripe_subscription_id").notNull(),
  priceId: text("price_id"),
  tier: text("tier").$type<Tier>().notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* -------------------------------------------------------- inferred types --- */

export type Merchant = typeof merchants.$inferSelect;
export type Store = typeof stores.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewMediaRow = typeof reviewMedia.$inferSelect;
export type Widget = typeof widgets.$inferSelect;
export type WidgetSettingsRow = typeof widgetSettings.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type DiscountCode = typeof discountCodes.$inferSelect;
