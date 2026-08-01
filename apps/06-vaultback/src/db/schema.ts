/**
 * Drizzle schema for the VaultBack control plane.
 *
 * Shared by the Next.js app, the cron tick, and the standalone worker. This
 * database holds *metadata only* — it never holds customer row data. The
 * columns that hold anything sensitive (`database_connections`,
 * `storage_targets`, `restore_runs`) are AES-256-GCM ciphertext under
 * CREDENTIALS_KEY, which is a different key from the one wrapping snapshot data
 * keys.
 *
 * Ciphertext is stored as `bytea`, matching ARCHITECTURE.md; postgres.js maps
 * that to a Node Buffer in both directions.
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
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ----------------------------------------------------------------- types --- */

export type PlanId = "hobby" | "startup" | "business";
export type MemberRole = "owner" | "admin" | "member";
export type Provider = "supabase" | "neon" | "planetscale" | "railway" | "generic";
export type ConnectionStatus = "pending" | "active" | "unreachable" | "disabled";
export type StorageKind = "managed" | "byo_s3" | "byo_r2";
export type Frequency = "hourly" | "daily";
export type DrillFrequency = "none" | "monthly" | "weekly";
export type JobTrigger = "scheduled" | "manual" | "retry";
export type JobStatus = "queued" | "running" | "uploading" | "succeeded" | "failed";
export type DrillStatus = "queued" | "restoring" | "verifying" | "passed" | "failed";
export type RestoreStatus = "queued" | "restoring" | "verifying" | "succeeded" | "failed";
export type SubStatus = "active" | "past_due" | "canceled" | "trialing" | "incomplete";
export type Stage = "dump" | "compress" | "encrypt" | "upload" | "verify" | "done";

/** One row of a drill's per-table verification, stored in `rowcount_checks`. */
export interface RowcountCheck {
  table: string;
  expected: number;
  actual: number;
  ok: boolean;
}

/** What a dump records about its source, so a restore can be verified. */
export interface TableManifest {
  tables: { table: string; rows: number }[];
  totalRows: number;
  postgresVersion: string;
  dumpedAt: string;
}

/* ----------------------------------------------------------- users / orgs --- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  /** Null for GitHub-only accounts: they authenticate by OAuth, not password. */
  passwordHash: text("password_hash"),
  githubId: text("github_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /**
   * The effective plan. Only the Stripe webhook and `applyPlan` write it;
   * everything else reads it for gating. New orgs start on Hobby with no card —
   * `trialEndsAt` is what makes that honest rather than free forever.
   */
  plan: text("plan").$type<PlanId>().notNull().default("hobby"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  /** Where failure alerts go. Seeded with the owner's email at signup. */
  alertEmail: text("alert_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const organizationMembers = pgTable(
  "organization_members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  priceId: text("price_id"),
  plan: text("plan").$type<PlanId>().notNull().default("hobby"),
  status: text("status").$type<SubStatus>().notNull().default("trialing"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------------------------------------------------- connections --- */

export const databaseConnections = pgTable(
  "database_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").$type<Provider>().notNull().default("generic"),
    /** AES-256-GCM ciphertext of the connection string. Never logged. */
    encryptedConnectionString: bytea("encrypted_connection_string").notNull(),
    /** Displayable identity without decrypting: "db.abcd.supabase.co:5432/postgres". */
    hostFingerprint: text("host_fingerprint").notNull(),
    /** True when the host/port pair looks like a transaction pooler. */
    pooled: boolean("pooled").notNull().default(false),
    postgresVersion: text("postgres_version"),
    approxSizeBytes: bigint("approx_size_bytes", { mode: "number" }),
    tableCount: integer("table_count"),
    /** Set when the supplied role is superuser — we nag, we do not block. */
    roleIsSuperuser: boolean("role_is_superuser").notNull().default(false),
    status: text("status").$type<ConnectionStatus>().notNull().default("pending"),
    lastCheckError: text("last_check_error"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("database_connections_org_idx").on(t.orgId)],
);

export const storageTargets = pgTable(
  "storage_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<StorageKind>().notNull().default("managed"),
    bucket: text("bucket").notNull().default(""),
    region: text("region").notNull().default("auto"),
    /** R2 and other S3-compatible endpoints. Null for AWS S3. */
    endpoint: text("endpoint"),
    prefix: text("prefix").notNull().default(""),
    /** Ciphertext of {accessKeyId, secretAccessKey}. Null for managed targets. */
    encryptedCredentials: bytea("encrypted_credentials"),
    isDefault: boolean("is_default").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastCheckError: text("last_check_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("storage_targets_org_idx").on(t.orgId)],
);

/* -------------------------------------------------------------- policies --- */

export const backupPolicies = pgTable(
  "backup_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    databaseConnectionId: uuid("database_connection_id")
      .notNull()
      .unique()
      .references(() => databaseConnections.id, { onDelete: "cascade" }),
    storageTargetId: uuid("storage_target_id")
      .notNull()
      .references(() => storageTargets.id, { onDelete: "restrict" }),
    frequency: text("frequency").$type<Frequency>().notNull().default("daily"),
    /** Derived from frequency + hour, kept so the UI can show the real thing. */
    scheduleCron: text("schedule_cron").notNull().default("0 4 * * *"),
    timezone: text("timezone").notNull().default("UTC"),
    retentionDays: integer("retention_days").notNull().default(30),
    enabled: boolean("enabled").notNull().default(true),
    /** The scheduler's work queue. Advanced before the job runs, never after. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    /** Set by the watchdog when a slot passed with no job; cleared on success. */
    missedSince: timestamp("missed_since", { withTimezone: true }),
    drillFrequency: text("drill_frequency").$type<DrillFrequency>().notNull().default("none"),
    nextDrillAt: timestamp("next_drill_at", { withTimezone: true }),
    lastDrillAt: timestamp("last_drill_at", { withTimezone: true }),
    lastPruneAt: timestamp("last_prune_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The tick's hot query: enabled and due.
    index("backup_policies_due_idx").on(t.nextRunAt, t.enabled),
    index("backup_policies_org_idx").on(t.orgId),
  ],
);

/* ------------------------------------------------------------ operations --- */

export const backupJobs = pgTable(
  "backup_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id").references(() => backupPolicies.id, { onDelete: "set null" }),
    databaseConnectionId: uuid("database_connection_id")
      .notNull()
      .references(() => databaseConnections.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<JobTrigger>().notNull().default("scheduled"),
    status: text("status").$type<JobStatus>().notNull().default("queued"),
    /** Which slot this job was for — makes a scheduled run idempotent per slot. */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    bytesProcessed: bigint("bytes_processed", { mode: "number" }).notNull().default(0),
    /** Which of dump/compress/encrypt/upload/verify the job reached. */
    stage: text("stage").$type<Stage>().notNull().default("dump"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    attempt: integer("attempt").notNull().default(1),
    queueJobId: text("queue_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("backup_jobs_conn_idx").on(t.databaseConnectionId, t.createdAt),
    index("backup_jobs_org_idx").on(t.orgId, t.createdAt),
    // One scheduled slot may only ever produce one job.
    uniqueIndex("backup_jobs_slot_idx").on(t.policyId, t.scheduledFor),
  ],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    backupJobId: uuid("backup_job_id")
      .notNull()
      .references(() => backupJobs.id, { onDelete: "cascade" }),
    databaseConnectionId: uuid("database_connection_id")
      .notNull()
      .references(() => databaseConnections.id, { onDelete: "cascade" }),
    storageTargetId: uuid("storage_target_id")
      .notNull()
      .references(() => storageTargets.id, { onDelete: "restrict" }),
    objectKey: text("object_key").notNull(),
    /** Uncompressed dump bytes. */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull().default(0),
    /** What actually landed in the bucket: gzipped, then encrypted. */
    compressedSizeBytes: bigint("compressed_size_bytes", { mode: "number" }).notNull().default(0),
    /** sha256 of the *stored* object — what an integrity check re-derives. */
    sha256: text("sha256").notNull(),
    /** The data key, encrypted under the master key. Plaintext never persists. */
    wrappedDataKey: bytea("wrapped_data_key").notNull(),
    keyId: text("key_id").notNull(),
    dumpEngine: text("dump_engine").notNull().default("pg_dump"),
    pgDumpVersion: text("pg_dump_version"),
    manifest: jsonb("manifest").$type<TableManifest>(),
    durationMs: integer("duration_ms").notNull().default(0),
    /** Retention horizon; the pruner deletes the object and soft-deletes here. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("snapshots_conn_idx").on(t.databaseConnectionId, t.createdAt),
    index("snapshots_expiry_idx").on(t.expiresAt),
  ],
);

export const restoreDrills = pgTable(
  "restore_drills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id").references(() => backupPolicies.id, { onDelete: "set null" }),
    databaseConnectionId: uuid("database_connection_id")
      .notNull()
      .references(() => databaseConnections.id, { onDelete: "cascade" }),
    status: text("status").$type<DrillStatus>().notNull().default("queued"),
    trigger: text("trigger").$type<JobTrigger>().notNull().default("scheduled"),
    /** Name of the ephemeral database this drill created and then dropped. */
    scratchInstance: text("scratch_instance"),
    tablesExpected: integer("tables_expected").notNull().default(0),
    tablesRestored: integer("tables_restored").notNull().default(0),
    rowsExpected: bigint("rows_expected", { mode: "number" }).notNull().default(0),
    rowsRestored: bigint("rows_restored", { mode: "number" }).notNull().default(0),
    rowcountChecks: jsonb("rowcount_checks").$type<RowcountCheck[]>(),
    checksumVerified: boolean("checksum_verified").notNull().default(false),
    durationMs: integer("duration_ms").notNull().default(0),
    errorDetail: text("error_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("restore_drills_conn_idx").on(t.databaseConnectionId, t.createdAt),
    index("restore_drills_org_idx").on(t.orgId, t.createdAt),
  ],
);

/**
 * One-click restores into a customer-supplied target. Separate from drills
 * because the safety rules differ: a drill owns its scratch database, a restore
 * touches something the customer cares about.
 */
export const restoreRuns = pgTable(
  "restore_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<RestoreStatus>().notNull().default("queued"),
    /** Target host+db only — enough to attribute, not enough to connect. */
    targetFingerprint: text("target_fingerprint").notNull(),
    /** Ciphertext of the target connection string; cleared when the run ends. */
    encryptedTarget: bytea("encrypted_target"),
    allowNonEmpty: boolean("allow_non_empty").notNull().default(false),
    statementsTotal: integer("statements_total").notNull().default(0),
    statementsApplied: integer("statements_applied").notNull().default(0),
    tablesRestored: integer("tables_restored").notNull().default(0),
    rowsRestored: bigint("rows_restored", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms").notNull().default(0),
    errorDetail: text("error_detail"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("restore_runs_org_idx").on(t.orgId, t.createdAt)],
);

/* ------------------------------------------------------------- audit log --- */

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Null for system events — a scheduled backup has no actor. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_org_idx").on(t.orgId, t.createdAt)],
);

/** Alert dedupe: one row per alert actually delivered. */
export const alertDeliveries = pgTable(
  "alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** Stable per incident, so a retrying job cannot re-send the same alert. */
    dedupeKey: text("dedupe_key").notNull(),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("alert_deliveries_dedupe_idx").on(t.orgId, t.dedupeKey)],
);

/* ------------------------------------------------------------------ rows --- */

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type DatabaseConnection = typeof databaseConnections.$inferSelect;
export type StorageTarget = typeof storageTargets.$inferSelect;
export type BackupPolicy = typeof backupPolicies.$inferSelect;
export type BackupJob = typeof backupJobs.$inferSelect;
export type Snapshot = typeof snapshots.$inferSelect;
export type RestoreDrill = typeof restoreDrills.$inferSelect;
export type RestoreRun = typeof restoreRuns.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;
