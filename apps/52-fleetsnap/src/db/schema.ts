/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all FleetSnap tables -- the single source of
 * truth for the data model described in ARCHITECTURE.md ("Data Model").
 * This schema is complete and real: migrate it as-is with drizzle-kit.
 *
 * Tenancy convention: everything hangs off fleets.id, directly or through
 * vehicles. Inspections are immutable after submission -- corrections are
 * new records referencing the old.
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

export const planEnum = pgEnum("plan", ["crew", "fleet", "depot"]);
export const userRoleEnum = pgEnum("user_role", ["owner", "dispatcher"]);
export const driverStatusEnum = pgEnum("driver_status", ["active", "inactive"]);
export const vehicleClassEnum = pgEnum("vehicle_class", [
  "truck",
  "van",
  "trailer",
  "equipment",
]);
export const vehicleStatusEnum = pgEnum("vehicle_status", [
  "active",
  "in_shop",
  "out_of_service",
  "retired",
]);
export const inspectionKindEnum = pgEnum("inspection_kind", [
  "pre_trip",
  "post_trip",
]);
export const inspectionStatusEnum = pgEnum("inspection_status", [
  "draft",
  "submitted",
]);
export const itemResultEnum = pgEnum("item_result", ["pass", "fail", "na"]);
export const defectSeverityEnum = pgEnum("defect_severity", [
  "critical",
  "normal",
]);
export const defectStatusEnum = pgEnum("defect_status", [
  "open",
  "ticketed",
  "resolved",
]);
export const workOrderSourceEnum = pgEnum("work_order_source", [
  "defect",
  "reminder",
  "manual",
]);
export const workOrderStatusEnum = pgEnum("work_order_status", [
  "open",
  "scheduled",
  "in_shop",
  "resolved",
]);
export const serviceKindEnum = pgEnum("service_kind", [
  "oil",
  "tires",
  "brakes",
  "repair",
  "other",
]);
export const reminderStatusEnum = pgEnum("reminder_status", [
  "ok",
  "due",
  "overdue",
]);
export const notificationChannelEnum = pgEnum("notification_channel", [
  "sms",
  "email",
]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "inspection_link",
  "oos_alert",
  "ticket_opened",
  "service_due",
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

export const fleets = pgTable("fleets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("crew"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  timezone: text("timezone").notNull().default("America/Chicago"),
  // { criticalItemKeys: string[], digestDay: string, yards: string[] }
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
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("users_email_ux").on(t.email)],
);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    smsOptedOutAt: timestamp("sms_opted_out_at", { withTimezone: true }),
    driverTokenHash: text("driver_token_hash"),
    status: driverStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("drivers_fleet_ix").on(t.fleetId)],
);

// ---------------------------------------------------------------------------
// Assets & templates
// ---------------------------------------------------------------------------

export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    unitNumber: text("unit_number").notNull(),
    vin: text("vin"),
    plate: text("plate"),
    vehicleClass: vehicleClassEnum("vehicle_class").notNull().default("truck"),
    yard: text("yard"),
    status: vehicleStatusEnum("status").notNull().default("active"),
    photoKey: text("photo_key"),
    currentOdometer: integer("current_odometer"),
    odometerUpdatedAt: timestamp("odometer_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("vehicles_fleet_ix").on(t.fleetId),
    uniqueIndex("vehicles_fleet_unit_ux").on(t.fleetId, t.unitNumber),
  ],
);

export const inspectionTemplates = pgTable("inspection_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  fleetId: uuid("fleet_id")
    .notNull()
    .references(() => fleets.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  vehicleClass: vehicleClassEnum("vehicle_class").notNull().default("truck"),
  // Ordered [{ key, label, items: [{ key, label, critical }] }]
  groups: jsonb("groups").notNull().default([]),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ---------------------------------------------------------------------------
// Inspections -- immutable after submission
// ---------------------------------------------------------------------------

export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id")
      .notNull()
      .references(() => drivers.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => inspectionTemplates.id),
    kind: inspectionKindEnum("kind").notNull().default("pre_trip"),
    status: inspectionStatusEnum("status").notNull().default("draft"),
    // Client-generated draft id: the offline exactly-once key.
    clientDraftId: text("client_draft_id").notNull(),
    odometer: integer("odometer"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    signatureName: text("signature_name"),
    defectCount: integer("defect_count").notNull().default(0),
    // Coarse { lat, lng }, transparent to the fleet
    location: jsonb("location"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inspections_draft_ux").on(t.clientDraftId),
    index("inspections_vehicle_ix").on(t.vehicleId, t.submittedAt),
  ],
);

export const inspectionItems = pgTable(
  "inspection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => inspections.id, { onDelete: "cascade" }),
    groupKey: text("group_key").notNull(),
    itemKey: text("item_key").notNull(),
    label: text("label").notNull(),
    result: itemResultEnum("result").notNull(),
    note: text("note"),
    critical: boolean("critical").notNull().default(false),
  },
  (t) => [
    uniqueIndex("inspection_items_ux").on(t.inspectionId, t.groupKey, t.itemKey),
  ],
);

// ---------------------------------------------------------------------------
// Defects, work orders, service
// ---------------------------------------------------------------------------

export const defects = pgTable(
  "defects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inspectionItemId: uuid("inspection_item_id")
      .notNull()
      .references(() => inspectionItems.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    reportedByDriverId: uuid("reported_by_driver_id").references(
      () => drivers.id,
    ),
    severity: defectSeverityEnum("severity").notNull().default("normal"),
    status: defectStatusEnum("status").notNull().default("open"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("defects_item_ux").on(t.inspectionItemId),
    index("defects_vehicle_status_ix").on(t.vehicleId, t.status),
  ],
);

export const serviceReminders = pgTable(
  "service_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    intervalMiles: integer("interval_miles"),
    intervalDays: integer("interval_days"),
    lastDoneOdometer: integer("last_done_odometer"),
    lastDoneOn: timestamp("last_done_on", { withTimezone: true }),
    nextDueOdometer: integer("next_due_odometer"),
    nextDueOn: timestamp("next_due_on", { withTimezone: true }),
    status: reminderStatusEnum("status").notNull().default("ok"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("service_reminders_vehicle_ix").on(t.vehicleId)],
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // yearly sequence, "2026-041"
    title: text("title").notNull(),
    source: workOrderSourceEnum("source").notNull().default("manual"),
    defectId: uuid("defect_id").references(() => defects.id),
    serviceReminderId: uuid("service_reminder_id").references(
      () => serviceReminders.id,
    ),
    status: workOrderStatusEnum("status").notNull().default("open"),
    vendorNote: text("vendor_note"),
    costCents: integer("cost_cents"),
    odometerAtService: integer("odometer_at_service"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("work_orders_fleet_number_ux").on(t.fleetId, t.number),
    index("work_orders_vehicle_status_ix").on(t.vehicleId, t.status),
  ],
);

export const serviceEntries = pgTable(
  "service_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    kind: serviceKindEnum("kind").notNull().default("other"),
    summary: text("summary").notNull(),
    costCents: integer("cost_cents"),
    odometer: integer("odometer"),
    performedOn: timestamp("performed_on", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("service_entries_vehicle_ix").on(t.vehicleId, t.performedOn)],
);

// ---------------------------------------------------------------------------
// Evidence, delivery ledger, webhook idempotency, audit
// ---------------------------------------------------------------------------

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    inspectionItemId: uuid("inspection_item_id").references(
      () => inspectionItems.id,
    ),
    defectId: uuid("defect_id").references(() => defects.id),
    workOrderId: uuid("work_order_id").references(() => workOrders.id),
    storageKey: text("storage_key").notNull(),
    takenBy: text("taken_by").notNull(), // "driver:<id>" | "user:<id>"
    takenAt: timestamp("taken_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("photos_item_ix").on(t.inspectionItemId),
    index("photos_work_order_ix").on(t.workOrderId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    driverId: uuid("driver_id").references(() => drivers.id),
    userId: uuid("user_id").references(() => users.id),
    channel: notificationChannelEnum("channel").notNull(),
    kind: notificationKindEnum("kind").notNull(),
    providerMessageId: text("provider_message_id"),
    status: notificationStatusEnum("status").notNull().default("queued"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_fleet_ix").on(t.fleetId, t.occurredAt)],
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
    fleetId: uuid("fleet_id")
      .notNull()
      .references(() => fleets.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(), // "user:<id>" | "driver:<id>" | "system"
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_fleet_ix").on(t.fleetId, t.occurredAt)],
);
