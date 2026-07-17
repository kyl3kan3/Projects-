/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all TurnoverKit tables -- the single source of
 * truth for the data model described in ARCHITECTURE.md ("Data Model").
 * This schema is complete and real: migrate it as-is with drizzle-kit.
 *
 * Tenancy convention: everything hangs off hosts.id, directly or through
 * units. Evidence tables (photos, issues) are append-only by convention --
 * corrections add rows, they never rewrite history.
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

export const planEnum = pgEnum("plan", ["solo", "host", "operator"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "manager"]);
export const unitStatusEnum = pgEnum("unit_status", ["active", "paused"]);
export const feedSourceEnum = pgEnum("feed_source", [
  "airbnb",
  "vrbo",
  "direct",
  "other",
]);
export const feedStatusEnum = pgEnum("feed_status", ["ok", "error"]);
export const stayStatusEnum = pgEnum("stay_status", ["active", "cancelled"]);
export const cleanerStatusEnum = pgEnum("cleaner_status", [
  "active",
  "inactive",
]);
export const turnoverStatusEnum = pgEnum("turnover_status", [
  "scheduled",
  "in_progress",
  "verified",
  "blocked",
  "cancelled",
]);
export const roomCheckStatusEnum = pgEnum("room_check_status", [
  "pending",
  "done",
]);
export const photoKindEnum = pgEnum("photo_kind", [
  "verification",
  "damage",
  "lost_item",
  "reference",
]);
export const issueKindEnum = pgEnum("issue_kind", [
  "damage",
  "lost_item",
  "maintenance",
]);
export const issueStatusEnum = pgEnum("issue_status", ["open", "resolved"]);
export const notificationChannelEnum = pgEnum("notification_channel", [
  "sms",
  "email",
]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "job_assigned",
  "job_changed",
  "low_stock",
  "turnover_blocked",
  "digest",
]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "opted_out",
]);

// ---------------------------------------------------------------------------
// Tenant root
// ---------------------------------------------------------------------------

export const hosts = pgTable("hosts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  plan: planEnum("plan").notNull().default("solo"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/New_York"),
  // { defaultWindowStartHour, defaultWindowEndHour, notificationPrefs }
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
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
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
// Units & calendars
// ---------------------------------------------------------------------------

export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Ordered list of { key, label, tasks: string[], requiredPhotos: number }
  rooms: jsonb("rooms").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cleaners = pgTable("cleaners", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id")
    .notNull()
    .references(() => hosts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  smsOptIn: boolean("sms_opt_in").notNull().default(false),
  smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
  notes: text("notes"),
  status: cleanerStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const units = pgTable(
  "units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    accessNotes: text("access_notes"),
    checkinTime: text("checkin_time").notNull().default("16:00"),
    checkoutTime: text("checkout_time").notNull().default("11:00"),
    defaultCleanerId: uuid("default_cleaner_id").references(() => cleaners.id),
    checklistTemplateId: uuid("checklist_template_id").references(
      () => checklistTemplates.id,
    ),
    status: unitStatusEnum("status").notNull().default("active"),
    coverPhotoKey: text("cover_photo_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("units_host_ix").on(t.hostId)],
);

export const icalFeeds = pgTable(
  "ical_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    source: feedSourceEnum("source").notNull().default("other"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastHash: text("last_hash"),
    status: feedStatusEnum("status").notNull().default("ok"),
    errorNote: text("error_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ical_feeds_unit_ix").on(t.unitId)],
);

export const stays = pgTable(
  "stays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    feedId: uuid("feed_id")
      .notNull()
      .references(() => icalFeeds.id, { onDelete: "cascade" }),
    externalUid: text("external_uid").notNull(),
    startsOn: timestamp("starts_on", { withTimezone: true }).notNull(),
    endsOn: timestamp("ends_on", { withTimezone: true }).notNull(),
    status: stayStatusEnum("status").notNull().default("active"),
    rawSummary: text("raw_summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("stays_feed_uid_ux").on(t.feedId, t.externalUid),
    index("stays_unit_window_ix").on(t.unitId, t.startsOn),
  ],
);

// ---------------------------------------------------------------------------
// Turnovers -- the core object
// ---------------------------------------------------------------------------

export const turnovers = pgTable(
  "turnovers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    departingStayId: uuid("departing_stay_id").references(() => stays.id),
    arrivingStayId: uuid("arriving_stay_id").references(() => stays.id),
    cleanerId: uuid("cleaner_id").references(() => cleaners.id),
    windowStartsAt: timestamp("window_starts_at", {
      withTimezone: true,
    }).notNull(),
    windowEndsAt: timestamp("window_ends_at", { withTimezone: true }).notNull(),
    status: turnoverStatusEnum("status").notNull().default("scheduled"),
    jobTokenHash: text("job_token_hash"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    verifiedPhotoCount: integer("verified_photo_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("turnovers_unit_window_ix").on(t.unitId, t.windowStartsAt),
    index("turnovers_cleaner_window_ix").on(t.cleanerId, t.windowStartsAt),
    uniqueIndex("turnovers_departing_stay_ux").on(t.departingStayId),
  ],
);

export const roomChecks = pgTable(
  "room_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turnoverId: uuid("turnover_id")
      .notNull()
      .references(() => turnovers.id, { onDelete: "cascade" }),
    roomKey: text("room_key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    // { [taskLabel: string]: boolean }
    tasksDone: jsonb("tasks_done").notNull().default({}),
    requiredPhotos: integer("required_photos").notNull().default(1),
    status: roomCheckStatusEnum("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("room_checks_turnover_room_ux").on(t.turnoverId, t.roomKey)],
);

// ---------------------------------------------------------------------------
// Evidence: photos & issues
// ---------------------------------------------------------------------------

export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    turnoverId: uuid("turnover_id").references(() => turnovers.id),
    kind: issueKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    filedByCleanerId: uuid("filed_by_cleaner_id").references(() => cleaners.id),
    filedByUserId: uuid("filed_by_user_id").references(() => users.id),
    status: issueStatusEnum("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("issues_unit_status_ix").on(t.unitId, t.status)],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    turnoverId: uuid("turnover_id").references(() => turnovers.id),
    roomCheckId: uuid("room_check_id").references(() => roomChecks.id),
    issueId: uuid("issue_id").references(() => issues.id),
    storageKey: text("storage_key").notNull(),
    takenByCleanerId: uuid("taken_by_cleaner_id").references(() => cleaners.id),
    takenByUserId: uuid("taken_by_user_id").references(() => users.id),
    kind: photoKindEnum("kind").notNull().default("verification"),
    takenAt: timestamp("taken_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("photos_turnover_ix").on(t.turnoverId),
    index("photos_issue_ix").on(t.issueId),
  ],
);

// ---------------------------------------------------------------------------
// Restock
// ---------------------------------------------------------------------------

export const stockItems = pgTable(
  "stock_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    unitLabel: text("unit_label").notNull().default("units"),
    parLevel: integer("par_level").notNull().default(0),
    currentCount: integer("current_count").notNull().default(0),
    lastCountedAt: timestamp("last_counted_at", { withTimezone: true }),
    lowSince: timestamp("low_since", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("stock_items_unit_ix").on(t.unitId)],
);

export const stockCounts = pgTable(
  "stock_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockItemId: uuid("stock_item_id")
      .notNull()
      .references(() => stockItems.id, { onDelete: "cascade" }),
    turnoverId: uuid("turnover_id").references(() => turnovers.id),
    count: integer("count").notNull(),
    countedByCleanerId: uuid("counted_by_cleaner_id").references(
      () => cleaners.id,
    ),
    countedByUserId: uuid("counted_by_user_id").references(() => users.id),
    countedAt: timestamp("counted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("stock_counts_item_ix").on(t.stockItemId)],
);

// ---------------------------------------------------------------------------
// Delivery ledger, webhook idempotency, audit
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    cleanerId: uuid("cleaner_id").references(() => cleaners.id),
    userId: uuid("user_id").references(() => users.id),
    channel: notificationChannelEnum("channel").notNull(),
    kind: notificationKindEnum("kind").notNull(),
    providerMessageId: text("provider_message_id"),
    status: notificationStatusEnum("status").notNull().default("queued"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_host_ix").on(t.hostId, t.occurredAt)],
);

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
    hostId: uuid("host_id")
      .notNull()
      .references(() => hosts.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(), // "user:<id>" | "cleaner:<id>" | "system"
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_host_ix").on(t.hostId, t.occurredAt)],
);
