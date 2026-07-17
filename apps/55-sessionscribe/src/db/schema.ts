/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all SessionScribe tables — the complete data model
 * from ARCHITECTURE.md ("Data Model"), fully defined. This file is the spine
 * of the build: migrations are generated from it via `npm run db:generate`,
 * and every module types itself against these tables.
 *
 * Invariants encoded here (enforce the rest in code + tests):
 * - notes.session_id is unique: one note per session.
 * - signatures reference (note_id, version) — a signed version is immutable;
 *   amendments create a new note_versions row and a new signature.
 * - audit_events is append-only (no update path is ever written for it).
 * - webhook_events.external_id is unique — the Stripe idempotency ledger.
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

// ---------------------------------------------------------------- enums

export const planEnum = pgEnum("plan", ["solo", "caseload", "group"]);

export const userRoleEnum = pgEnum("user_role", [
  "clinician",
  "supervisor",
  "admin",
]);

export const noteFormatEnum = pgEnum("note_format", ["soap", "dap"]);

export const modalityEnum = pgEnum("modality", [
  "general",
  "cbt",
  "emdr",
  "couples",
  "play",
  "sfbt",
]);

export const recordingConsentEnum = pgEnum("recording_consent", [
  "none",
  "verbal",
  "written",
]);

export const clientStatusEnum = pgEnum("client_status", [
  "active",
  "archived",
]);

export const captureKindEnum = pgEnum("capture_kind", [
  "recording",
  "upload",
  "shorthand",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "captured",
  "transcribing",
  "drafting",
  "ready",
  "signed",
  "failed",
]);

export const noteStatusEnum = pgEnum("note_status", [
  "drafting",
  "draft",
  "signed",
  "amended",
]);

export const noteVersionReasonEnum = pgEnum("note_version_reason", [
  "draft",
  "edit",
  "amendment",
]);

export const signatureKindEnum = pgEnum("signature_kind", [
  "author",
  "cosign",
]);

export const actorKindEnum = pgEnum("actor_kind", ["user", "system"]);

// ---------------------------------------------------------------- tables

export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("solo"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  baaAcceptedAt: timestamp("baa_accepted_at", { withTimezone: true }),
  retentionDays: integer("retention_days").notNull().default(30),
  timezone: text("timezone").notNull().default("America/New_York"),
  settings: jsonb("settings")
    .$type<{
      defaultFormat?: "soap" | "dap";
      notifyOnDraftReady?: boolean;
    }>()
    .notNull()
    .default({}),
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
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    credentials: text("credentials").notNull().default(""),
    role: userRoleEnum("role").notNull().default("clinician"),
    defaultFormat: noteFormatEnum("default_format").notNull().default("soap"),
    signatureBlock: text("signature_block").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_practice_idx").on(t.practiceId),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null practiceId = built-in template shipped with the product
    practiceId: uuid("practice_id").references(() => practices.id),
    name: text("name").notNull(),
    format: noteFormatEnum("format").notNull(),
    modality: modalityEnum("modality").notNull().default("general"),
    sections: jsonb("sections")
      .$type<{ key: string; label: string; guidance: string }[]>()
      .notNull(),
    isBuiltin: boolean("is_builtin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("templates_practice_idx").on(t.practiceId)],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id),
    // PHI-minimal by design: a clinician-chosen display label, not a chart.
    displayLabel: text("display_label").notNull(),
    modality: modalityEnum("modality").notNull().default("general"),
    defaultTemplateId: uuid("default_template_id").references(
      () => templates.id,
    ),
    recordingConsent: recordingConsentEnum("recording_consent")
      .notNull()
      .default("none"),
    consentNotedAt: timestamp("consent_noted_at", { withTimezone: true }),
    status: clientStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("clients_practice_idx").on(t.practiceId),
    index("clients_clinician_idx").on(t.clinicianId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id),
    heldAt: timestamp("held_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes"),
    captureKind: captureKindEnum("capture_kind").notNull(),
    shorthandText: text("shorthand_text"),
    status: sessionStatusEnum("status").notNull().default("captured"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_client_idx").on(t.clientId),
    index("sessions_clinician_held_idx").on(t.clinicianId, t.heldAt),
    index("sessions_status_idx").on(t.status),
  ],
);

export const audioArtifacts = pgTable(
  "audio_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    durationSeconds: integer("duration_seconds"),
    byteSize: integer("byte_size"),
    purgeAt: timestamp("purge_at", { withTimezone: true }).notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audio_session_idx").on(t.sessionId),
    index("audio_purge_idx").on(t.purgeAt),
  ],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    provider: text("provider").notNull().default("deepgram"),
    segments: jsonb("segments")
      .$type<
        { speaker: number; startMs: number; endMs: number; text: string }[]
      >()
      .notNull(),
    wordCount: integer("word_count").notNull().default(0),
    purgeAt: timestamp("purge_at", { withTimezone: true }).notNull(),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transcripts_session_idx").on(t.sessionId),
    index("transcripts_purge_idx").on(t.purgeAt),
  ],
);

export type NoteSection = {
  key: string;
  text: string;
  sourceSpans: { startMs: number; endMs: number }[];
};

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id),
    format: noteFormatEnum("format").notNull(),
    status: noteStatusEnum("status").notNull().default("drafting"),
    sections: jsonb("sections").$type<NoteSection[]>().notNull().default([]),
    model: text("model"),
    draftGeneratedAt: timestamp("draft_generated_at", { withTimezone: true }),
    currentVersion: integer("current_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("notes_session_unique").on(t.sessionId),
    index("notes_clinician_status_idx").on(t.clinicianId, t.status),
  ],
);

export const noteVersions = pgTable(
  "note_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id),
    version: integer("version").notNull(),
    sections: jsonb("sections").$type<NoteSection[]>().notNull(),
    reason: noteVersionReasonEnum("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("note_versions_unique").on(t.noteId, t.version)],
);

export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id),
    version: integer("version").notNull(),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => users.id),
    signerCredentials: text("signer_credentials").notNull(),
    kind: signatureKindEnum("kind").notNull().default("author"),
    contentHash: text("content_hash").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("signatures_unique").on(t.noteId, t.version, t.kind),
    index("signatures_signer_idx").on(t.signerId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    actorId: uuid("actor_id").references(() => users.id),
    actorKind: actorKindEnum("actor_kind").notNull().default("user"),
    action: text("action").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_practice_time_idx").on(t.practiceId, t.occurredAt),
    index("audit_target_idx").on(t.targetKind, t.targetId),
  ],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id),
    period: text("period").notNull(), // "2026-07"
    notesDrafted: integer("notes_drafted").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("usage_period_unique").on(t.practiceId, t.period)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull().default("stripe"),
    externalId: text("external_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("webhook_external_unique").on(t.provider, t.externalId)],
);
