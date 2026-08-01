/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all WaiverWing tables — the single source of truth
 * for the data model in ARCHITECTURE.md ("Data Model").
 *
 * The one design decision worth reading before the rest: a `signatures` row is
 * an **evidence artifact**, not a join. It carries its own copy of the exact
 * text that was agreed to (`signed_text`), the blocks that produced it
 * (`signed_blocks`), the answers and initials given, and a SHA-256 over the
 * canonical rendering (`text_hash`). The foreign key to `waiver_versions`
 * stays for navigation, but nothing about the record depends on that row still
 * existing or still saying the same thing. Editing a waiver after a signature
 * cannot change what a past signature appears to have agreed to, because the
 * past signature does not read from the waiver at all.
 *
 * `waiver_versions` are append-only by construction: publishing snapshots the
 * draft into a new numbered version and never updates a published one.
 */

import { relations, sql } from "drizzle-orm";
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

/* ------------------------------------------------------------------ enums */

export const planEnum = pgEnum("plan", ["counter", "front_desk", "operator"]);
export const roleEnum = pgEnum("user_role", ["owner", "manager", "staff"]);
export const waiverStatusEnum = pgEnum("waiver_status", ["draft", "live", "archived"]);
export const expiryRuleEnum = pgEnum("expiry_rule", ["visit", "days_365", "forever"]);
export const signatureKindEnum = pgEnum("signature_kind", ["typed", "drawn"]);
export const channelEnum = pgEnum("signing_channel", ["qr", "kiosk", "link"]);
export const incidentStatusEnum = pgEnum("incident_status", ["open", "closed"]);
export const exportKindEnum = pgEnum("export_kind", [
  "signature_pdf",
  "bulk_pdf",
  "incident_pdf",
  "csv",
]);

export type Plan = (typeof planEnum.enumValues)[number];
export type UserRole = (typeof roleEnum.enumValues)[number];
export type WaiverStatus = (typeof waiverStatusEnum.enumValues)[number];
export type ExpiryRule = (typeof expiryRuleEnum.enumValues)[number];
export type SignatureKind = (typeof signatureKindEnum.enumValues)[number];
export type SigningChannel = (typeof channelEnum.enumValues)[number];
export type IncidentStatus = (typeof incidentStatusEnum.enumValues)[number];
export type ExportKind = (typeof exportKindEnum.enumValues)[number];

/* ---------------------------------------------------------- block configs */

/** Free liability prose. Signed verbatim. */
export interface LiabilityTextConfig {
  heading: string;
  body: string;
}

/** A clause the signer must initial separately. */
export interface InitialedClauseConfig {
  text: string;
  /** Shown to the signer above the initials box. */
  prompt: string;
}

/** A custom question (emergency contact, medical flag, address …). */
export interface QuestionConfig {
  label: string;
  kind: "text" | "phone" | "email" | "yes_no" | "long_text";
  required: boolean;
  /** Marks the answer as a medical/health flag so it lands in participant flags. */
  medical?: boolean;
  help?: string;
}

/** The signature block: disclosure sentence + what kinds are accepted. */
export interface SignatureBlockConfig {
  disclosure: string;
  allowDrawn: boolean;
}

/** Block config persisted on waiver_versions.body_blocks. */
export interface WaiverBlock {
  key: string;
  kind: "liability_text" | "initialed_clause" | "question" | "signature";
  config: Record<string, unknown>;
}

/**
 * Minor rules, stored on the waiver and snapshotted onto every version.
 *
 * `resignAtMajority` is the answer to "what happens when a minor turns 18
 * mid-season": a guardian's authority to bind another person ends when that
 * person becomes an adult, so coverage signed for them stops on their majority
 * birthday even if the waiver's own expiry rule says "forever". Operators who
 * disagree can turn it off per waiver; the default is on.
 */
export interface MinorRule {
  ageOfMajority: number;
  relationshipOptions: string[];
  /** Does the guardian also sign a waiver in their own name? */
  guardianSignsForSelf: boolean;
  /** Expire guardian-signed coverage on the minor's age-of-majority birthday. */
  resignAtMajority: boolean;
}

export const DEFAULT_MINOR_RULE: MinorRule = {
  ageOfMajority: 18,
  relationshipOptions: ["Parent", "Legal guardian", "Grandparent", "Adult sibling"],
  guardianSignsForSelf: false,
  resignAtMajority: true,
};

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface AccountSettings {
  /** "Waivers by WaiverWing" on printed posters. Suppressed on Operator. */
  posterFooter: boolean;
  retentionYears: number;
  /** Local hour (0-23) the daily digest is sent at. */
  digestHour: number;
}

export const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  posterFooter: true,
  retentionYears: 7,
  digestHour: 19,
};

/* ----------------------------------------------------------------- tables */

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("counter"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  settings: jsonb("settings")
    .$type<AccountSettings>()
    .notNull()
    .default(DEFAULT_ACCOUNT_SETTINGS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: text("timezone").notNull().default("America/Denver"),
    kioskPin: text("kiosk_pin").notNull().default("2468"),
    /** Rotatable. Rotating kills every printed poster — the UI says so loudly. */
    qrToken: text("qr_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("locations_qr_token_uq").on(t.qrToken),
    index("locations_account_idx").on(t.accountId),
  ],
);

export const waivers = pgTable(
  "waivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: waiverStatusEnum("status").notNull().default("draft"),
    expiryRule: expiryRuleEnum("expiry_rule").notNull().default("days_365"),
    minorRule: jsonb("minor_rule").$type<MinorRule>().notNull().default(DEFAULT_MINOR_RULE),
    activityTags: text("activity_tags").array().notNull().default(sql`'{}'::text[]`),
    /** The editable working copy. Published versions are snapshots of this. */
    draftBlocks: jsonb("draft_blocks").$type<WaiverBlock[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("waivers_account_idx").on(t.accountId)],
);

/**
 * Immutable text snapshots. Nothing in the app ever UPDATEs a row here —
 * publishing inserts version N+1. The expiry and minor rules in force at
 * publish time are snapshotted too, so a later rule change cannot retroactively
 * alter how an old signature is interpreted.
 */
export const waiverVersions = pgTable(
  "waiver_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    waiverId: uuid("waiver_id")
      .notNull()
      .references(() => waivers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    bodyBlocks: jsonb("body_blocks").$type<WaiverBlock[]>().notNull(),
    expiryRule: expiryRuleEnum("expiry_rule").notNull(),
    minorRule: jsonb("minor_rule").$type<MinorRule>().notNull(),
    /** SHA-256 over renderVersionText() — the hash every signature must match. */
    textHash: text("text_hash").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("waiver_versions_waiver_version_uq").on(t.waiverId, t.version),
    index("waiver_versions_waiver_idx").on(t.waiverId),
  ],
);

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Normalized at write time (lowercased) so search needs no read-time tricks. */
    email: text("email"),
    /** Normalized at write time to digits only. */
    phone: text("phone"),
    dob: text("dob"), // ISO yyyy-mm-dd; a calendar date, not an instant
    /** Derived at signing time from the waiver's age of majority. */
    isMinor: boolean("is_minor").notNull().default(false),
    guardianParticipantId: uuid("guardian_participant_id"),
    emergencyContact: jsonb("emergency_contact").$type<EmergencyContact | null>(),
    flags: jsonb("flags").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("participants_account_idx").on(t.accountId),
    index("participants_guardian_idx").on(t.guardianParticipantId),
    index("participants_name_trgm").using(
      "gin",
      sql`(lower(${t.firstName}) || ' ' || lower(${t.lastName})) gin_trgm_ops`,
    ),
    index("participants_last_trgm").using("gin", sql`lower(${t.lastName}) gin_trgm_ops`),
    index("participants_email_trgm").using(
      "gin",
      sql`lower(coalesce(${t.email}, '')) gin_trgm_ops`,
    ),
    index("participants_phone_trgm").using("gin", sql`coalesce(${t.phone}, '') gin_trgm_ops`),
  ],
);

/**
 * One row per signed waiver per participant. This is the artifact a lawyer
 * reads eighteen months from now; everything needed to defend it lives here.
 */
export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** Navigation only. The record below does not depend on it. */
    waiverVersionId: uuid("waiver_version_id")
      .notNull()
      .references(() => waiverVersions.id),
    waiverId: uuid("waiver_id")
      .notNull()
      .references(() => waivers.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),

    // --- what was actually agreed (self-contained copy) ---
    waiverTitle: text("waiver_title").notNull(),
    waiverVersion: integer("waiver_version").notNull(),
    signedText: text("signed_text").notNull(),
    signedBlocks: jsonb("signed_blocks").$type<WaiverBlock[]>().notNull(),
    textHash: text("text_hash").notNull(),
    answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
    initials: jsonb("initials").$type<Record<string, string>>().notNull().default({}),
    disclosureText: text("disclosure_text").notNull(),
    disclosureAcceptedAt: timestamp("disclosure_accepted_at", { withTimezone: true }).notNull(),

    // --- who signed ---
    signerName: text("signer_name").notNull(),
    signedByParticipantId: uuid("signed_by_participant_id").references(() => participants.id),
    guardianRelationship: text("guardian_relationship"),
    /** Age of the *participant* at signing, computed server-side from DOB. */
    signerAgeYears: integer("signer_age_years"),
    /** Was the participant a minor at signing, per the version's minor rule? */
    minorAtSigning: boolean("minor_at_signing").notNull().default(false),
    ageOfMajorityAtSigning: integer("age_of_majority_at_signing").notNull().default(18),
    /** Snapshot of the rule so a later waiver edit cannot reinterpret this row. */
    resignAtMajority: boolean("resign_at_majority").notNull().default(true),

    // --- signature mark ---
    signatureKind: signatureKindEnum("signature_kind").notNull(),
    /** Typed: the typed name. Drawn: SVG path data (small; kept inline). */
    signatureData: text("signature_data").notNull(),
    signatureAssetKey: text("signature_asset_key"),

    // --- evidence ---
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    expiryRule: expiryRuleEnum("expiry_rule").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    channel: channelEnum("channel").notNull(),
    /** Kiosk offline sync idempotency key. Unique when present. */
    offlineKey: text("offline_key"),
    /** When the client captured it (offline); differs from signedAt on replay. */
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("signatures_offline_key_uq").on(t.offlineKey),
    index("signatures_participant_idx").on(t.participantId, t.signedAt),
    index("signatures_account_signed_idx").on(t.accountId, t.signedAt),
    index("signatures_expires_idx").on(t.expiresAt),
    index("signatures_location_signed_idx").on(t.locationId, t.signedAt),
  ],
);

export const checkins = pgTable(
  "checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** The proving signature: "we verified coverage at entry, and here it is." */
    signatureId: uuid("signature_id").references(() => signatures.id),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    byUserId: uuid("by_user_id").references(() => users.id),
  },
  (t) => [index("checkins_location_time_idx").on(t.locationId, t.checkedInAt)],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    whereText: text("where_text"),
    status: incidentStatusEnum("status").notNull().default("open"),
    loggedByUserId: uuid("logged_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("incidents_account_time_idx").on(t.accountId, t.occurredAt)],
);

export const incidentParticipants = pgTable(
  "incident_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    /** The waiver in force at occurred_at. Null means none was — recorded honestly. */
    signatureId: uuid("signature_id").references(() => signatures.id),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("incident_participants_uq").on(t.incidentId, t.participantId)],
);

export const exportLog = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  kind: exportKindEnum("kind").notNull(),
  scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
  s3Key: text("s3_key"),
  byteSize: integer("byte_size"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeEventId: text("stripe_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_stripe_id_uq").on(t.stripeEventId)],
);

/* -------------------------------------------------------------- relations */

export const accountsRelations = relations(accounts, ({ many }) => ({
  users: many(users),
  locations: many(locations),
  waivers: many(waivers),
  participants: many(participants),
}));

export const waiversRelations = relations(waivers, ({ one, many }) => ({
  account: one(accounts, { fields: [waivers.accountId], references: [accounts.id] }),
  versions: many(waiverVersions),
}));

export const waiverVersionsRelations = relations(waiverVersions, ({ one }) => ({
  waiver: one(waivers, { fields: [waiverVersions.waiverId], references: [waivers.id] }),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  account: one(accounts, { fields: [participants.accountId], references: [accounts.id] }),
  guardian: one(participants, {
    fields: [participants.guardianParticipantId],
    references: [participants.id],
    relationName: "guardian",
  }),
  minors: many(participants, { relationName: "guardian" }),
  signatures: many(signatures),
}));

export const signaturesRelations = relations(signatures, ({ one }) => ({
  participant: one(participants, {
    fields: [signatures.participantId],
    references: [participants.id],
  }),
  version: one(waiverVersions, {
    fields: [signatures.waiverVersionId],
    references: [waiverVersions.id],
  }),
  location: one(locations, { fields: [signatures.locationId], references: [locations.id] }),
}));

export const incidentsRelations = relations(incidents, ({ one, many }) => ({
  location: one(locations, { fields: [incidents.locationId], references: [locations.id] }),
  links: many(incidentParticipants),
}));

export const incidentParticipantsRelations = relations(incidentParticipants, ({ one }) => ({
  incident: one(incidents, {
    fields: [incidentParticipants.incidentId],
    references: [incidents.id],
  }),
  participant: one(participants, {
    fields: [incidentParticipants.participantId],
    references: [participants.id],
  }),
  signature: one(signatures, {
    fields: [incidentParticipants.signatureId],
    references: [signatures.id],
  }),
}));

/* -------------------------------------------------------------- row types */

export type Account = typeof accounts.$inferSelect;
export type User = typeof users.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Waiver = typeof waivers.$inferSelect;
export type WaiverVersion = typeof waiverVersions.$inferSelect;
export type Participant = typeof participants.$inferSelect;
export type Signature = typeof signatures.$inferSelect;
export type Checkin = typeof checkins.$inferSelect;
export type Incident = typeof incidents.$inferSelect;
export type IncidentParticipant = typeof incidentParticipants.$inferSelect;
export type ExportRow = typeof exports.$inferSelect;
