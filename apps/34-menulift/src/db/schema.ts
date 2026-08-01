/**
 * MenuLift schema (ARCHITECTURE.md "Data Model").
 *
 * Two rules the whole product leans on:
 *
 *  1. **Money is integer cents, always.** `price_cents`, `cost_cents`,
 *     `revenue_cents`. Nothing is a float; rounding happens once, at the edge.
 *  2. **Everything hangs off a location**, because a location is the billable
 *     unit *and* the tenancy boundary — an 86 is location truth, not org truth.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
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

/* ------------------------------------------------------------------ tenancy */

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** menu | kitchen | margin — see src/lib/plans.ts */
  plan: text("plan").notNull().default("menu"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  /** trialing | active | past_due | canceled | none */
  subscriptionStatus: text("subscription_status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  /** Stripe subscription quantity — kept in step with active locations. */
  locationQuantity: integer("location_quantity").notNull().default(1),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    /** owner | manager */
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Guest URL segment: /m/<slug>. Globally unique. */
    slug: text("slug").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    address: text("address"),
    /**
     * 4-6 digit PIN for the expo-station 86 board. A phone at the pass should
     * not need a full login; the PIN is scoped to one location and to the board.
     */
    staffPin: text("staff_pin"),
    /**
     * Hour (local) at which "tonight" rolls over, and when nightly auto-restore
     * runs. 4am by default — a 1am 86 is still last night's service.
     */
    serviceRolloverHour: integer("service_rollover_hour").notNull().default(4),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("locations_slug_unique").on(t.slug),
    index("locations_org_idx").on(t.organizationId),
  ],
);

/* -------------------------------------------------------------------- menus */

export const menus = pgTable(
  "menus",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /**
     * Daypart window, or null for "always available".
     * `{ days: number[] 0=Sun, start: "17:00", end: "22:00" }`; a window whose
     * end is <= start crosses midnight. See src/lib/dayparts.ts.
     */
    daypart: jsonb("daypart").$type<Daypart | null>(),
    /** draft | live */
    status: text("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menus_location_idx").on(t.locationId)],
);

export const menuSections = pgTable(
  "menu_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    note: text("note"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_sections_menu_idx").on(t.menuId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => menuSections.id, { onDelete: "cascade" }),
    /**
     * Denormalised from section -> menu -> location. The 86 board and the
     * service log are location-scoped and must not need two joins to answer
     * "what is 86'd here right now".
     */
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    /** Plate cost. Null until the owner enters it; margin math waits, stats don't. */
    costCents: integer("cost_cents"),
    /** GF | V | VG | DF — validated in src/lib/menus.ts, typeset as labels. */
    dietaryTags: text("dietary_tags").array().notNull().default([]),
    isEightySixed: boolean("is_eighty_sixed").notNull().default(false),
    eightySixNote: text("eighty_six_note"),
    /** Restore automatically at the location's next service rollover. */
    autoRestore: boolean("auto_restore").notNull().default(true),
    position: integer("position").notNull().default(0),
    photoId: uuid("photo_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("menu_items_section_idx").on(t.sectionId),
    index("menu_items_location_idx").on(t.locationId),
  ],
);

/* ------------------------------------------------------------------- photos */

export const itemPhotos = pgTable(
  "item_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    originalKey: text("original_key").notNull(),
    /** Candidate from the enhancement pass. Never overwrites the original. */
    enhancedKey: text("enhanced_key"),
    /** pending | processing | ready | approved | rejected | failed */
    status: text("status").notNull().default("pending"),
    /** What the pipeline did, in plain words, for the review card. */
    note: text("note"),
    /** Honest failure text ("too dark to relight — retake near a window"). */
    error: text("error"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    /** Milliseconds the enhancement pass took — the review card quotes it. */
    enhanceMs: integer("enhance_ms"),
    shotAt: timestamp("shot_at", { withTimezone: true }).notNull().defaultNow(),
    enhancedAt: timestamp("enhanced_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("item_photos_item_idx").on(t.menuItemId),
    index("item_photos_location_idx").on(t.locationId, t.status),
  ],
);

/**
 * Local object store, used when R2 is not configured (dev, preview, CI).
 * The R2 driver is the production path; this keeps the whole photo flow
 * exercisable without a cloud credential. See src/lib/storage.ts.
 */
export const photoObjects = pgTable("photo_objects", {
  key: text("key").primaryKey(),
  contentType: text("content_type").notNull(),
  /** base64 — a bytea column would be better, but this keeps the driver portable. */
  bytes: text("bytes").notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------------- 86 events */

export const eightySixEvents = pgTable(
  "eighty_six_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** Null when the actor was a PIN session rather than a logged-in user. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Always set: "Dana" or "expo station" — the board shows a name, not a uuid. */
    actorLabel: text("actor_label").notNull(),
    note: text("note"),
    eightySixedAt: timestamp("eighty_sixed_at", { withTimezone: true }).notNull().defaultNow(),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
    /** manual | nightly_auto — how it came back, recorded when it does. */
    restoreMode: text("restore_mode"),
  },
  (t) => [
    index("eighty_six_events_location_idx").on(t.locationId, t.eightySixedAt),
    index("eighty_six_events_item_idx").on(t.menuItemId),
  ],
);

/* --------------------------------------------------------------- change log */

export const menuChangeLog = pgTable(
  "menu_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
    /** Kept so history survives the item it describes. */
    itemName: text("item_name"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorLabel: text("actor_label").notNull(),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_change_log_location_idx").on(t.locationId, t.changedAt)],
);

/* ------------------------------------------------------ POS import + matrix */

export const posImports = pgTable(
  "pos_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** toast | square | other */
    source: text("source").notNull(),
    filename: text("filename").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    rowCount: integer("row_count").notNull().default(0),
    matchedCount: integer("matched_count").notNull().default(0),
    /** Row names we could not match, so the owner sees exactly what was dropped. */
    unmatched: jsonb("unmatched").$type<UnmatchedRow[]>().notNull().default([]),
    columnMapping: jsonb("column_mapping").$type<ColumnMapping | null>(),
    /** uploaded | mapping | processing | complete | failed */
    status: text("status").notNull().default("uploaded"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pos_imports_location_idx").on(t.locationId, t.createdAt)],
);

export const itemSalesStats = pgTable(
  "item_sales_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    posImportId: uuid("pos_import_id")
      .notNull()
      .references(() => posImports.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    qtySold: integer("qty_sold").notNull(),
    revenueCents: integer("revenue_cents").notNull(),
    /** Plate cost as it stood at import time, so a later edit can't rewrite history. */
    costCentsAtImport: integer("cost_cents_at_import"),
    matchedName: text("matched_name").notNull(),
    /** exact | normalized | fuzzy — shown on the import review screen. */
    matchKind: text("match_kind").notNull(),
  },
  (t) => [
    uniqueIndex("item_sales_stats_import_item_unique").on(t.posImportId, t.menuItemId),
    index("item_sales_stats_import_idx").on(t.posImportId),
  ],
);

export const matrixSnapshots = pgTable(
  "matrix_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    posImportId: uuid("pos_import_id")
      .notNull()
      .references(() => posImports.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    sectionName: text("section_name").notNull(),
    itemName: text("item_name").notNull(),
    /** star | plowhorse | puzzle | dog — null when the data can't support a call. */
    quadrant: text("quadrant"),
    /** needs_cost | too_few_sales | too_few_items — why there is no quadrant. */
    withheldReason: text("withheld_reason"),
    /** Ratio ×10000: 10000 means exactly on the threshold. */
    popularityIndex: integer("popularity_index").notNull(),
    marginIndex: integer("margin_index"),
    /** Share of section units, basis points. */
    mixShareBp: integer("mix_share_bp").notNull(),
    contributionMarginCents: integer("contribution_margin_cents"),
    qtySold: integer("qty_sold").notNull(),
    recommendation: text("recommendation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("matrix_snapshots_import_item_unique").on(t.posImportId, t.menuItemId),
    index("matrix_snapshots_import_idx").on(t.posImportId),
  ],
);

/* ----------------------------------------------------------------- QR + ops */

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    /** Null = the location's default menu (whatever daypart is live). */
    menuId: uuid("menu_id").references(() => menus.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    /** table_tent | window_card | raw_svg */
    format: text("format").notNull().default("table_tent"),
    scanCount: integer("scan_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qr_codes_location_idx").on(t.locationId)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [primaryKey({ columns: [t.stripeEventId] })],
);

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_idx").on(t.organizationId, t.createdAt)],
);

/* -------------------------------------------------------------- jsonb types */

export interface Daypart {
  /** 0 = Sunday. Empty or absent means every day. */
  days?: number[];
  /** "HH:MM", 24h, in the location's timezone. */
  start: string;
  end: string;
}

export interface UnmatchedRow {
  name: string;
  qty: number;
  netCents: number;
}

export interface ColumnMapping {
  name: string;
  qty: string;
  net: string;
}

/* --------------------------------------------------------------- relations */

export const locationsRelations = relations(locations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [locations.organizationId],
    references: [organizations.id],
  }),
  menus: many(menus),
}));

export const menusRelations = relations(menus, ({ one, many }) => ({
  location: one(locations, { fields: [menus.locationId], references: [locations.id] }),
  sections: many(menuSections),
}));

export const menuSectionsRelations = relations(menuSections, ({ one, many }) => ({
  menu: one(menus, { fields: [menuSections.menuId], references: [menus.id] }),
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  section: one(menuSections, { fields: [menuItems.sectionId], references: [menuSections.id] }),
}));

/* ------------------------------------------------------------------- types */

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Menu = typeof menus.$inferSelect;
export type MenuSection = typeof menuSections.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type ItemPhoto = typeof itemPhotos.$inferSelect;
export type EightySixEvent = typeof eightySixEvents.$inferSelect;
export type MenuChangeLogRow = typeof menuChangeLog.$inferSelect;
export type PosImport = typeof posImports.$inferSelect;
export type ItemSalesStat = typeof itemSalesStats.$inferSelect;
export type MatrixSnapshot = typeof matrixSnapshots.$inferSelect;
export type QrCode = typeof qrCodes.$inferSelect;
