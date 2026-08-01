/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for every FormForge table — the single source of truth for
 * the data model in ARCHITECTURE.md ("Data Model").
 *
 * Three decisions worth reading before the rest:
 *
 * 1. **Columns whose name ends in `Enc` hold AES-256-GCM ciphertext** (bytea),
 *    written and read only through `src/lib/crypto.ts` + `src/lib/phi.ts`. The
 *    key is a per-practice data key, itself stored only in wrapped form on
 *    `practices.dek_wrapped`. A dump of this database yields no readable PHI.
 *
 * 2. **`signature_records` is an evidence artifact, not a join.** It carries its
 *    own copy of the exact consent text that was presented (`signed_text`), the
 *    disclosure sentence, the form title and version number as they read at the
 *    time, and a SHA-256 over the canonical rendering. Editing a form afterwards
 *    publishes a new version and touches none of it — a past signature never
 *    reads from a mutable row.
 *
 * 3. **`audit_events` and `form_versions` are append-only in the database**, not
 *    by convention: migration 0001 installs BEFORE UPDATE/DELETE/TRUNCATE
 *    triggers that raise, and revokes those grants from PUBLIC. Application code
 *    could not tamper with either table even if it tried.
 */

import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
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

/* ------------------------------------------------------------------ bytea */

/**
 * Postgres `bytea` as a Node Buffer. Drizzle 0.41 has no first-class bytea, and
 * a hand-rolled type is better here than base64-in-text: the ciphertext stays
 * bytes end to end, so nothing can silently double-encode it.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string" && value.startsWith("\\x")) {
      return Buffer.from(value.slice(2), "hex");
    }
    throw new Error("Unexpected bytea representation from the driver");
  },
  toDriver(value: Buffer): Buffer {
    return value;
  },
});

/* ------------------------------------------------------------------ enums */

export const planEnum = pgEnum("plan", ["solo", "group", "clinic"]);
export const roleEnum = pgEnum("user_role", ["owner", "clinician", "frontdesk"]);
export const formStatusEnum = pgEnum("form_status", ["draft", "live", "archived"]);
export const intakeStatusEnum = pgEnum("intake_status", [
  "sent",
  "started",
  "completed",
  "signed",
  "expired",
]);
export const signatureKindEnum = pgEnum("signature_kind", ["typed", "drawn"]);
export const auditActionEnum = pgEnum("audit_action", [
  "viewed",
  "edited",
  "exported",
  "sent",
  "signed",
  "deleted",
  "login",
  "published",
  "reminded",
]);
export const actorTypeEnum = pgEnum("actor_type", ["user", "patient", "system"]);
export const reminderChannelEnum = pgEnum("reminder_channel", ["email", "sms"]);
export const reminderStatusEnum = pgEnum("reminder_status", [
  "pending",
  "sent",
  "failed",
  "cancelled",
]);
export const exportKindEnum = pgEnum("export_kind", ["packet_pdf", "intakes_csv", "audit_csv"]);

export type Plan = (typeof planEnum.enumValues)[number];
export type UserRole = (typeof roleEnum.enumValues)[number];
export type FormStatus = (typeof formStatusEnum.enumValues)[number];
export type IntakeStatus = (typeof intakeStatusEnum.enumValues)[number];
export type SignatureKind = (typeof signatureKindEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];
export type ActorType = (typeof actorTypeEnum.enumValues)[number];
export type ReminderChannel = (typeof reminderChannelEnum.enumValues)[number];
export type ReminderStatus = (typeof reminderStatusEnum.enumValues)[number];
export type ExportKind = (typeof exportKindEnum.enumValues)[number];

/* --------------------------------------------------------- block contracts */

export type BlockKind =
  | "demographics"
  | "insurance"
  | "history"
  | "consent"
  | "signature"
  | "upload"
  | "screener";

/** Ordered block config persisted on forms/form_versions. */
export interface FormBlock {
  key: string;
  kind: BlockKind;
  config: Record<string, unknown>;
}

/** Per-practice settings. Defaults live in lib/practices.ts. */
export interface PracticeSettings {
  /** IANA zone — quiet hours and every rendered timestamp are practice-local. */
  timeZone: string;
  /** Quiet hours in practice-local 24h "HH:MM". Reminders shift out of them. */
  quietStart: string;
  quietEnd: string;
  /** Reminder ladder as hours after send. Fixed distances, never "still overdue". */
  reminderHours: number[];
  /** Intake link lifetime. */
  linkDays: number;
  /** Retention in years; the sweep hard-deletes past this. */
  retentionYears: number;
  /** Notify the assigned clinician when PHQ-9 item 9 is positive. */
  notifyOnRiskFlag: boolean;
  /** Front-desk role sees packet status but not screener scores. */
  hideScoresFromFrontDesk: boolean;
}

/** Screener totals, deliberately stored outside the ciphertext (reportable). */
export interface ScoreSummary {
  [instrument: string]: { total: number; severity: string; flagged: boolean };
}

/* -------------------------------------------------------------- practices */

export const practices = pgTable("practices", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: planEnum("plan").notNull().default("solo"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  /** Per-practice AES-256 data key, wrapped under FIELD_ENCRYPTION_MASTER_KEY. */
  dekWrapped: bytea("dek_wrapped").notNull(),
  /** Fingerprint of the master key that wrapped it, so rotation can find rows. */
  dekKeyId: text("dek_key_id").notNull(),
  settings: jsonb("settings").$type<PracticeSettings>().notNull(),
  /**
   * Data-protection agreement acceptance. FormForge is pre-launch and does not
   * offer an executed BAA — this records that a named person reviewed and
   * accepted the draft template, plus a hash of the exact text they saw.
   */
  agreementAcceptedAt: timestamp("agreement_accepted_at", { withTimezone: true }),
  agreementVersion: text("agreement_version"),
  agreementSignerName: text("agreement_signer_name"),
  agreementTextHash: text("agreement_text_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    index("users_practice_idx").on(t.practiceId),
  ],
);

/* ------------------------------------------------------------------ forms */

export const forms = pgTable(
  "forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: formStatusEnum("status").notNull().default("draft"),
    /** Highest published version number; 0 until first publish. */
    version: integer("version").notNull().default(0),
    /** Draft blocks. Published snapshots live in form_versions. */
    blocks: jsonb("blocks").$type<FormBlock[]>().notNull(),
    templateKey: text("template_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("forms_practice_status_idx").on(t.practiceId, t.status)],
);

/**
 * An immutable snapshot taken at publish. Submissions and signatures point here,
 * and nothing ever updates a published row (enforced by trigger in migration
 * 0001) — which is the whole reason a signature from March is still evidence in
 * November after the form was edited twice.
 */
export const formVersions = pgTable(
  "form_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    blocks: jsonb("blocks").$type<FormBlock[]>().notNull(),
    /** SHA-256 over the canonical rendering of title + version + blocks. */
    blocksHash: text("blocks_hash").notNull(),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("form_versions_form_version_unique").on(t.formId, t.version)],
);

/* --------------------------------------------------------------- patients */

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    firstNameEnc: bytea("first_name_enc").notNull(),
    lastNameEnc: bytea("last_name_enc").notNull(),
    emailEnc: bytea("email_enc"),
    phoneEnc: bytea("phone_enc"),
    dobEnc: bytea("dob_enc"),
    /**
     * Blind index: HMAC-SHA-256 over the normalised "last,first" under
     * INTAKE_TOKEN_SECRET. Lets the directory dedupe and look a patient up
     * without decrypting every row, and reveals nothing on its own.
     */
    nameKey: text("name_key").notNull(),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    smsOptOut: boolean("sms_opt_out").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("patients_practice_namekey_unique").on(t.practiceId, t.nameKey),
    index("patients_practice_idx").on(t.practiceId),
  ],
);

/* ---------------------------------------------------------------- intakes */

export const intakes = pgTable(
  "intakes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    formId: uuid("form_id")
      .notNull()
      .references(() => forms.id, { onDelete: "restrict" }),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => formVersions.id, { onDelete: "restrict" }),
    /** HMAC of the raw link token. The raw token exists only in the link. */
    tokenHash: text("token_hash").notNull(),
    status: intakeStatusEnum("status").notNull().default("sent"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    channelEmail: boolean("channel_email").notNull().default(true),
    channelSms: boolean("channel_sms").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Which section the patient is on — save-and-resume. */
    sectionIndex: integer("section_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("intakes_token_hash_unique").on(t.tokenHash),
    index("intakes_practice_status_idx").on(t.practiceId, t.status),
    index("intakes_patient_idx").on(t.patientId),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => intakes.id, { onDelete: "cascade" }),
    /** AES-GCM ciphertext of the JSON answer map. */
    answersEnc: bytea("answers_enc").notNull(),
    /** Screener totals only — reportable without decryption. */
    scoreSummary: jsonb("score_summary").$type<ScoreSummary>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("submissions_intake_unique").on(t.intakeId)],
);

/**
 * One signed consent block. Self-contained evidence — see the file header.
 */
export const signatureRecords = pgTable(
  "signature_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => intakes.id, { onDelete: "cascade" }),
    blockKey: text("block_key").notNull(),
    kind: signatureKindEnum("kind").notNull(),
    /** Typed name, or SVG path data for a drawn mark. Encrypted (it is PHI). */
    signaturePayloadEnc: bytea("signature_payload_enc").notNull(),
    signedNameEnc: bytea("signed_name_enc").notNull(),
    /** The consent text exactly as presented. Not a reference — a copy. */
    signedText: text("signed_text").notNull(),
    disclosureText: text("disclosure_text").notNull(),
    disclosureAcceptedAt: timestamp("disclosure_accepted_at", { withTimezone: true }).notNull(),
    /** SHA-256 over the canonical rendering of what was signed. */
    documentHash: text("document_hash").notNull(),
    formVersionId: uuid("form_version_id")
      .notNull()
      .references(() => formVersions.id, { onDelete: "restrict" }),
    formTitle: text("form_title").notNull(),
    formVersion: integer("form_version").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("signature_records_intake_block_unique").on(t.intakeId, t.blockKey),
    index("signature_records_practice_idx").on(t.practiceId),
  ],
);

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => intakes.id, { onDelete: "cascade" }),
    blockKey: text("block_key").notNull(),
    filenameEnc: bytea("filename_enc").notNull(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    /** Object-storage key when S3 is configured. */
    storageKey: text("storage_key"),
    /** Otherwise the AES-GCM envelope itself, in the database. */
    cipherBlob: bytea("cipher_blob"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_intake_idx").on(t.intakeId)],
);

/* ----------------------------------------------------------- audit events */

/**
 * Append-only. No UPDATE, DELETE or TRUNCATE reaches this table — migration
 * 0001 installs triggers that raise, so the guarantee holds against the
 * application, against a psql session, and against a future careless migration.
 *
 * `metadata` is PHI-free by an allowlist in lib/audit.ts, not by convention.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    /** User id, intake id (patient), or "cron"/"stripe" for system actors. */
    actorId: text("actor_id"),
    /** Denormalised so the ledger still reads after a user row is removed. */
    actorLabel: text("actor_label").notNull(),
    action: auditActionEnum("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    /** Human-readable target, PHI-free (a form title, "packet", a count). */
    targetLabel: text("target_label").notNull().default(""),
    ip: text("ip"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_practice_created_idx").on(t.practiceId, t.createdAt),
    index("audit_target_idx").on(t.practiceId, t.targetType, t.targetId, t.createdAt),
    index("audit_action_idx").on(t.practiceId, t.action),
  ],
);

/* --------------------------------------------------------------- reminders */

/**
 * The reminder ledger. One row per rung of the ladder, created when the intake
 * is sent, each with an absolute `scheduled_for` already shifted out of quiet
 * hours. Two properties fall out of that shape:
 *
 *  - a rung fires **once** — the unique index below is the dedupe, so no
 *    daily sweep can mail the same person every morning forever;
 *  - completion cancels the pending rows, so "stop on complete" is a single
 *    UPDATE rather than a job-cancellation dance.
 */
export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    intakeId: uuid("intake_id")
      .notNull()
      .references(() => intakes.id, { onDelete: "cascade" }),
    channel: reminderChannelEnum("channel").notNull(),
    /** Rung index in the ladder — part of the dedupe key. */
    step: integer("step").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: reminderStatusEnum("status").notNull().default("pending"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reminders_rung_unique").on(t.intakeId, t.channel, t.step),
    index("reminders_due_idx").on(t.status, t.scheduledFor),
  ],
);

/* ----------------------------------------------------------------- exports */

export const exportRecords = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    practiceId: uuid("practice_id")
      .notNull()
      .references(() => practices.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: exportKindEnum("kind").notNull(),
    targetIntakeId: uuid("target_intake_id").references(() => intakes.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exports_practice_idx").on(t.practiceId, t.createdAt)],
);

/* -------------------------------------------------------------- relations */

export const practicesRelations = relations(practices, ({ many }) => ({
  users: many(users),
  forms: many(forms),
  patients: many(patients),
  intakes: many(intakes),
}));

export const usersRelations = relations(users, ({ one }) => ({
  practice: one(practices, { fields: [users.practiceId], references: [practices.id] }),
}));

export const formsRelations = relations(forms, ({ one, many }) => ({
  practice: one(practices, { fields: [forms.practiceId], references: [practices.id] }),
  versions: many(formVersions),
}));

export const formVersionsRelations = relations(formVersions, ({ one }) => ({
  form: one(forms, { fields: [formVersions.formId], references: [forms.id] }),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  practice: one(practices, { fields: [patients.practiceId], references: [practices.id] }),
  assignedUser: one(users, { fields: [patients.assignedUserId], references: [users.id] }),
  intakes: many(intakes),
}));

export const intakesRelations = relations(intakes, ({ one, many }) => ({
  practice: one(practices, { fields: [intakes.practiceId], references: [practices.id] }),
  patient: one(patients, { fields: [intakes.patientId], references: [patients.id] }),
  formVersion: one(formVersions, {
    fields: [intakes.formVersionId],
    references: [formVersions.id],
  }),
  submission: one(submissions, { fields: [intakes.id], references: [submissions.intakeId] }),
  signatures: many(signatureRecords),
  reminders: many(reminders),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  intake: one(intakes, { fields: [submissions.intakeId], references: [intakes.id] }),
}));

export const signatureRecordsRelations = relations(signatureRecords, ({ one }) => ({
  intake: one(intakes, { fields: [signatureRecords.intakeId], references: [intakes.id] }),
  formVersion: one(formVersions, {
    fields: [signatureRecords.formVersionId],
    references: [formVersions.id],
  }),
}));

export const remindersRelations = relations(reminders, ({ one }) => ({
  intake: one(intakes, { fields: [reminders.intakeId], references: [intakes.id] }),
}));

/* -------------------------------------------------------------- row types */

export type Practice = typeof practices.$inferSelect;
export type User = typeof users.$inferSelect;
export type Form = typeof forms.$inferSelect;
export type FormVersion = typeof formVersions.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Intake = typeof intakes.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type SignatureRecord = typeof signatureRecords.$inferSelect;
export type Upload = typeof uploads.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type ExportRow = typeof exportRecords.$inferSelect;
