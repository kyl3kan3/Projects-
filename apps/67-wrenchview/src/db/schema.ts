/**
 * src/db/schema.ts
 *
 * Drizzle schema for WrenchView — the complete data model from
 * ARCHITECTURE.md. Multi-tenant off shops.id. The approvals table is
 * the immutable authorization trail.
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

export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["trial", "bay", "shop", "garage_group"] })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  phone: text("phone"),
  /** jsonb: { followupOffsets: [30, 90], taxRateBps, laborRateCents } */
  settings: jsonb("settings").notNull().default({}),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull().references(() => shops.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "advisor", "tech"] }).notNull().default("tech"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/** Bay tablets, signed in once per device. */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  label: text("label").notNull(),
  tokenHash: text("token_hash").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  smsConsent: boolean("sms_consent").notNull().default(true),
  smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
  ...timestamps,
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  customerId: uuid("customer_id").notNull().references(() => customers.id),
  year: integer("year"),
  make: text("make").notNull(),
  model: text("model").notNull(),
  vin: text("vin"),
  plate: text("plate"),
  mileageLatest: integer("mileage_latest"),
  ...timestamps,
});

/** Point lists with canned phrases per verdict. */
export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  name: text("name").notNull(),
  /**
   * jsonb: [{ label, items: [{ key, label, kind: "verdict" |
   * "measurement", unit?, cannedPhrases: { yellow, red } }] }]
   */
  groups: jsonb("groups").notNull().default([]),
  ...timestamps,
});

export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shopId: uuid("shop_id").notNull().references(() => shops.id),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
    templateId: uuid("template_id").notNull().references(() => templates.id),
    roNumber: text("ro_number"),
    techUserId: uuid("tech_user_id").references(() => users.id),
    deviceId: uuid("device_id").references(() => devices.id),
    status: text("status", {
      enum: ["in_progress", "tech_done", "estimated", "sent", "viewed", "decided", "archived"],
    })
      .notNull()
      .default("in_progress"),
    mileage: integer("mileage"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("inspections_shop_status_idx").on(t.shopId, t.status)],
);

/** The taps. */
export const inspectionItems = pgTable(
  "inspection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
    groupLabel: text("group_label").notNull(),
    itemKey: text("item_key").notNull(),
    itemLabel: text("item_label").notNull(),
    verdict: text("verdict", { enum: ["green", "yellow", "red", "na"] }),
    /** jsonb: { value: number, unit: "mm" | "32nds" | "cca" | ... } */
    measurement: jsonb("measurement"),
    note: text("note"),
    seq: integer("seq").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("inspection_items_key_idx").on(t.inspectionId, t.itemKey)],
);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  inspectionItemId: uuid("inspection_item_id").notNull().references(() => inspectionItems.id),
  kind: text("kind", { enum: ["photo", "video"] }).notNull(),
  r2Key: text("r2_key").notNull(),
  thumbKey: text("thumb_key"),
  webKey: text("web_key"),
  durationSeconds: integer("duration_seconds"),
  seq: integer("seq").notNull().default(0),
  ...timestamps,
});

/** Customer-readable sentences; advisor-editable before send. */
export const findings = pgTable("findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  inspectionItemId: uuid("inspection_item_id").notNull().unique().references(() => inspectionItems.id),
  sentence: text("sentence").notNull(),
  urgency: text("urgency", { enum: ["now", "soon", "watch"] }).notNull(),
  ...timestamps,
});

export const estimateLines = pgTable("estimate_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  findingId: uuid("finding_id").references(() => findings.id),
  label: text("label").notNull(),
  laborCents: integer("labor_cents").notNull().default(0),
  partsCents: integer("parts_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  status: text("status", { enum: ["draft", "sent", "approved", "declined"] })
    .notNull()
    .default("draft"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps,
});

/** Immutable: who approved what, when, from what. */
export const approvals = pgTable("approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  estimateLineId: uuid("estimate_line_id").notNull().references(() => estimateLines.id),
  decision: text("decision", { enum: ["approved", "declined"] }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  linkTokenHash: text("link_token_hash").notNull(),
});

export const reportLinks = pgTable("report_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  inspectionId: uuid("inspection_id").notNull().references(() => inspections.id),
  tokenHash: text("token_hash").notNull(),
  sentToPhone: text("sent_to_phone").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerMessageId: text("provider_message_id"),
  deliveryStatus: text("delivery_status"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  ...timestamps,
});

/** Declined-safety reminders; exactly once per kind. */
export const followups = pgTable(
  "followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estimateLineId: uuid("estimate_line_id").notNull().references(() => estimateLines.id),
    sendOn: date("send_on").notNull(),
    kind: text("kind", { enum: ["day30", "day90"] }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
  },
  (t) => [uniqueIndex("followups_line_kind_idx").on(t.estimateLineId, t.kind)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider", { enum: ["stripe", "twilio"] }).notNull(),
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
  shopId: uuid("shop_id").notNull().references(() => shops.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});
