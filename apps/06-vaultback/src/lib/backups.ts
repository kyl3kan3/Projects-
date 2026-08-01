/**
 * The backup pipeline.
 *
 *   pg_dump / vaultback-sql  →  sha256(plain)  →  gzip  →  AES-256-GCM  →
 *   sha256(stored)  →  S3 multipart upload
 *
 * Five streams, no disk. A 50 GB database uses roughly the same memory as a
 * 50 MB one, which is the property that makes this deployable anywhere.
 *
 * Every state change is written to `backup_jobs` before the next stage begins,
 * so a process that dies mid-upload leaves a job stuck in `uploading` rather
 * than a job that claims success. The watchdog reaps those.
 */

import { createGunzip, createGzip } from "node:zlib";
import { PassThrough, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, isNull, lte, ne, sql as raw } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupJobs,
  backupPolicies,
  databaseConnections,
  organizations,
  snapshots,
  storageTargets,
  type BackupJob,
  type BackupPolicy,
  type DatabaseConnection,
  type JobTrigger,
  type Snapshot,
  type Stage,
  type StorageTarget,
} from "@/db/schema";
import { alertOnce, backupFailedEmail, storageFailedEmail } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import {
  Sha256Tap,
  createDecryptStream,
  createEncryptStream,
  generateDataKey,
  unwrapDataKey,
} from "@/lib/crypto";
import { connectionStringFor } from "@/lib/connections";
import { openDump } from "@/lib/dump";
import { env } from "@/lib/env";
import { expiryFor } from "@/lib/schedule";
import { driverFor, objectKeyFor, StorageError } from "@/lib/storage";

export class BackupError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Read the stored object back and re-hash it, when it is small enough that the
 * egress is free or negligible. Above the limit the recorded checksum is the one
 * taken over the encrypted stream during upload, and the restore drill is what
 * proves the object is good. Set to 0 to disable.
 */
function verifyLimitBytes(): number {
  const configured = Number(process.env.VERIFY_READBACK_MAX_BYTES ?? "");
  return Number.isFinite(configured) && configured >= 0 ? configured : 512 * 1024 * 1024;
}

/* ------------------------------------------------------------- enqueueing --- */

export interface EnqueueInput {
  orgId: string;
  connectionId: string;
  policyId?: string | null;
  trigger: JobTrigger;
  /** The schedule slot this job serves. Null for manual runs. */
  scheduledFor?: Date | null;
}

/**
 * Create the job row. Returns null when this slot already has a job, which is
 * how two overlapping cron ticks can never double-run a schedule.
 */
export async function enqueueBackup(input: EnqueueInput): Promise<BackupJob | null> {
  const db = getDb();
  const rows = await db
    .insert(backupJobs)
    .values({
      orgId: input.orgId,
      policyId: input.policyId ?? null,
      databaseConnectionId: input.connectionId,
      trigger: input.trigger,
      status: "queued",
      scheduledFor: input.scheduledFor ?? null,
    })
    .onConflictDoNothing({ target: [backupJobs.policyId, backupJobs.scheduledFor] })
    .returning();
  return rows[0] ?? null;
}

async function setStage(jobId: string, stage: Stage, patch: Partial<BackupJob> = {}): Promise<void> {
  const db = getDb();
  await db
    .update(backupJobs)
    .set({ stage, ...patch })
    .where(eq(backupJobs.id, jobId));
}

/* ----------------------------------------------------------------- running --- */

export interface RunResult {
  jobId: string;
  ok: boolean;
  snapshotId?: string;
  error?: string;
  bytesStored?: number;
  durationMs: number;
}

export async function runBackupJob(jobId: string): Promise<RunResult> {
  const db = getDb();
  const startedAt = Date.now();

  const [job] = await db.select().from(backupJobs).where(eq(backupJobs.id, jobId));
  if (!job) throw new BackupError(`Backup job ${jobId} does not exist`, "job_missing");

  const [connection] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, job.databaseConnectionId));
  if (!connection) {
    await fail(job, "connection_missing", "The database was removed before this job ran");
    return { jobId, ok: false, error: "connection removed", durationMs: 0 };
  }

  const policy = job.policyId
    ? ((await db.select().from(backupPolicies).where(eq(backupPolicies.id, job.policyId)))[0] ??
      null)
    : (await db
        .select()
        .from(backupPolicies)
        .where(eq(backupPolicies.databaseConnectionId, connection.id)))[0] ?? null;

  const targetId = policy?.storageTargetId;
  const [target] = targetId
    ? await db.select().from(storageTargets).where(eq(storageTargets.id, targetId))
    : await db
        .select()
        .from(storageTargets)
        .where(and(eq(storageTargets.orgId, job.orgId), eq(storageTargets.isDefault, true)));
  if (!target) {
    await fail(job, "no_storage_target", "No storage target is configured for this organization");
    return { jobId, ok: false, error: "no storage target", durationMs: 0 };
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, job.orgId));
  if (!org) {
    await fail(job, "org_missing", "The organization no longer exists");
    return { jobId, ok: false, error: "org removed", durationMs: 0 };
  }

  if (connection.status === "disabled") {
    await fail(job, "connection_disabled", "This database is disabled");
    return { jobId, ok: false, error: "connection disabled", durationMs: 0 };
  }

  await db
    .update(backupJobs)
    .set({ status: "running", stage: "dump", startedAt: new Date() })
    .where(eq(backupJobs.id, job.id));

  await audit({
    orgId: job.orgId,
    action: "backup.started",
    subjectType: "connection",
    subjectId: connection.id,
    metadata: { name: connection.name, trigger: job.trigger, jobId: job.id },
  });

  const snapshotId = crypto.randomUUID();
  const takenAt = new Date();
  const objectKey = objectKeyFor({
    orgSlug: org.slug,
    connectionName: connection.name,
    takenAt,
    snapshotId,
  });

  let dump: Awaited<ReturnType<typeof openDump>> | null = null;

  try {
    const driver = driverFor(target);
    const dataKey = generateDataKey(env.backupMasterKey);

    dump = await openDump(connectionStringFor(connection));

    const plainTap = new Sha256Tap();
    const storedTap = new Sha256Tap();
    const gzip = createGzip({ level: 6 });
    const cipher = createEncryptStream(dataKey.plaintext);
    const body = new PassThrough();

    await setStage(job.id, "compress");

    const pumped = pipeline(dump.stream, plainTap, gzip, cipher, storedTap, body);
    // The uploader consumes `body` while the pipeline fills it; both have to be
    // in flight for a streaming upload to mean anything.
    const uploaded = (async () => {
      await setStage(job.id, "upload", { status: "uploading" });
      return driver.put(objectKey, body);
    })();

    await Promise.all([pumped, uploaded]);
    // pg_dump's exit code arrives after its stdout closes; a non-zero code here
    // means the dump was incomplete even though the upload "succeeded".
    await dump.finished;

    const plainBytes = plainTap.bytes;
    const storedBytes = storedTap.bytes;
    const checksum = storedTap.digest();

    await setStage(job.id, "verify", { bytesProcessed: storedBytes });

    const limit = verifyLimitBytes();
    if (limit > 0 && storedBytes <= limit) {
      // Read the object back out of storage and re-hash it. This is the only
      // check that catches a bucket that accepted the upload and stored
      // something else — a silent corruption we would otherwise discover at
      // restore time. Skipped above the size limit, where the drill is the
      // cheaper proof.
      const readback = new Sha256Tap();
      const sink = new Writable({
        write(_chunk, _enc, cb) {
          cb();
        },
      });
      await pipeline(await driver.get(objectKey), readback, sink);
      if (readback.digest() !== checksum) {
        throw new BackupError(
          "The uploaded object did not hash to the checksum computed while writing it",
          "checksum_mismatch",
        );
      }
    }

    const retentionDays = policy?.retentionDays ?? 30;
    const [snapshot] = await db
      .insert(snapshots)
      .values({
        id: snapshotId,
        orgId: job.orgId,
        backupJobId: job.id,
        databaseConnectionId: connection.id,
        storageTargetId: target.id,
        objectKey,
        sizeBytes: plainBytes,
        compressedSizeBytes: storedBytes,
        sha256: checksum,
        wrappedDataKey: dataKey.wrapped,
        keyId: dataKey.keyId,
        dumpEngine: dump.engine,
        pgDumpVersion: dump.pgDumpVersion,
        manifest: dump.manifest,
        durationMs: Date.now() - startedAt,
        expiresAt: expiryFor(retentionDays, takenAt),
      })
      .returning();

    // The plaintext data key goes out of scope here and is never persisted.
    dataKey.plaintext.fill(0);

    await db
      .update(backupJobs)
      .set({
        status: "succeeded",
        stage: "done",
        finishedAt: new Date(),
        bytesProcessed: storedBytes,
        errorCode: null,
        errorDetail: null,
      })
      .where(eq(backupJobs.id, job.id));

    if (policy) {
      await db
        .update(backupPolicies)
        .set({ lastRunAt: new Date(), lastSuccessAt: new Date(), missedSince: null })
        .where(eq(backupPolicies.id, policy.id));
    }

    await db
      .update(databaseConnections)
      .set({
        status: "active",
        approxSizeBytes: dump.inspection.sizeBytes,
        tableCount: dump.inspection.tables.length,
        postgresVersion: dump.inspection.postgresVersion,
        lastCheckError: null,
        lastCheckedAt: new Date(),
      })
      .where(eq(databaseConnections.id, connection.id));

    await audit({
      orgId: job.orgId,
      action: "backup.succeeded",
      subjectType: "snapshot",
      subjectId: snapshot.id,
      metadata: {
        name: connection.name,
        bytes: storedBytes,
        rows: dump.manifest.totalRows,
        tables: dump.manifest.tables.length,
        sha256: checksum,
        engine: dump.engine,
      },
    });

    return {
      jobId,
      ok: true,
      snapshotId: snapshot.id,
      bytesStored: storedBytes,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const code =
      err instanceof BackupError
        ? err.code
        : err instanceof StorageError
          ? "storage_error"
          : "dump_error";

    // A half-uploaded object is worse than none: it would look like a snapshot.
    try {
      await driverFor(target).remove(objectKey);
    } catch {
      /* best effort — the retention pruner will not know about this key */
    }

    await fail(job, code, detail, connection, policy, target);
    return { jobId, ok: false, error: detail, durationMs: Date.now() - startedAt };
  } finally {
    await dump?.close();
  }
}

async function fail(
  job: BackupJob,
  code: string,
  detail: string,
  connection?: DatabaseConnection,
  policy?: BackupPolicy | null,
  target?: StorageTarget,
): Promise<void> {
  const db = getDb();
  await db
    .update(backupJobs)
    .set({ status: "failed", finishedAt: new Date(), errorCode: code, errorDetail: detail })
    .where(eq(backupJobs.id, job.id));

  if (connection) {
    await db
      .update(databaseConnections)
      .set({ lastCheckError: detail, lastCheckedAt: new Date() })
      .where(eq(databaseConnections.id, connection.id));
    if (policy) {
      await db
        .update(backupPolicies)
        .set({ lastRunAt: new Date() })
        .where(eq(backupPolicies.id, policy.id));
    }
  }

  await audit({
    orgId: job.orgId,
    action: "backup.failed",
    subjectType: "connection",
    subjectId: job.databaseConnectionId,
    metadata: { name: connection?.name, code, detail, jobId: job.id },
  });

  if (code === "storage_error" && target) {
    const message = storageFailedEmail({ targetName: target.name, error: detail });
    await alertOnce({
      orgId: job.orgId,
      kind: "storage_failed",
      dedupeKey: `storage_failed:${target.id}:${new Date().toISOString().slice(0, 10)}`,
      ...message,
    });
    return;
  }

  const message = backupFailedEmail({
    databaseName: connection?.name ?? "a database",
    error: detail,
    attempt: job.attempt,
    lastSuccessAt: policy?.lastSuccessAt ?? null,
  });
  await alertOnce({
    orgId: job.orgId,
    kind: "backup_failed",
    // Keyed on the job, so retries of the same job do not re-alert but a new
    // failure tomorrow does.
    dedupeKey: `backup_failed:${job.id}`,
    ...message,
  });
}

/* ---------------------------------------------------------------- snapshots --- */

export async function listSnapshots(
  connectionId: string,
  opts: { includeDeleted?: boolean; limit?: number } = {},
): Promise<Snapshot[]> {
  const db = getDb();
  const where = opts.includeDeleted
    ? eq(snapshots.databaseConnectionId, connectionId)
    : and(eq(snapshots.databaseConnectionId, connectionId), isNull(snapshots.deletedAt));
  return db
    .select()
    .from(snapshots)
    .where(where)
    .orderBy(desc(snapshots.createdAt))
    .limit(opts.limit ?? 100);
}

export async function listSnapshotsForOrg(orgId: string, limit = 200): Promise<Snapshot[]> {
  const db = getDb();
  return db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.orgId, orgId), isNull(snapshots.deletedAt)))
    .orderBy(desc(snapshots.createdAt))
    .limit(limit);
}

export async function getSnapshot(snapshotId: string, orgId: string): Promise<Snapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.id, snapshotId), eq(snapshots.orgId, orgId)));
  return row ?? null;
}

export async function latestSnapshotFor(connectionId: string): Promise<Snapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.databaseConnectionId, connectionId), isNull(snapshots.deletedAt)))
    .orderBy(desc(snapshots.createdAt))
    .limit(1);
  return row ?? null;
}

export async function recentJobs(connectionId: string, limit = 10): Promise<BackupJob[]> {
  const db = getDb();
  return db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.databaseConnectionId, connectionId))
    .orderBy(desc(backupJobs.createdAt))
    .limit(limit);
}

export interface SnapshotStream {
  /** Plain SQL text. */
  stream: NodeJS.ReadableStream;
  /**
   * sha256 of the *stored* bytes, valid once the stream has been consumed.
   * Comparing it to `snapshots.sha256` is the integrity check a drill performs —
   * it proves the object in the bucket is byte-identical to what was uploaded.
   */
  storedDigest(): string;
}

/**
 * Open a decrypted, decompressed stream of a snapshot's SQL. Used by restores,
 * by drills, and by nothing else — the plaintext of a customer's database is not
 * something the web tier ever holds.
 */
export async function openSnapshotSql(snapshot: Snapshot): Promise<SnapshotStream> {
  const db = getDb();
  const [target] = await db
    .select()
    .from(storageTargets)
    .where(eq(storageTargets.id, snapshot.storageTargetId));
  if (!target) throw new BackupError("The storage target for this snapshot is gone", "no_target");

  const driver = driverFor(target);
  const key = unwrapDataKey(snapshot.wrappedDataKey, env.backupMasterKey);
  const object = await driver.get(snapshot.objectKey);
  const tap = new Sha256Tap();
  // Errors on the source or the decipher must not be swallowed: a truncated or
  // tampered object has to surface as a failed restore, never as a short one.
  const hashed = object.pipe(tap);
  object.on("error", (err) => hashed.destroy(err));
  const decrypted = hashed.pipe(createDecryptStream(key));
  hashed.on("error", (err) => decrypted.destroy(err));
  const plain = decrypted.pipe(createGunzip());
  decrypted.on("error", (err) => plain.destroy(err));
  return { stream: plain, storedDigest: () => tap.digest() };
}

/* --------------------------------------------------------------- retention --- */

/**
 * Delete snapshots past their retention horizon: the object first, then the row
 * (soft-deleted, so the audit trail still shows the snapshot existed).
 *
 * Order matters. Deleting the row first would orphan the object and quietly grow
 * the storage bill forever, which is the failure mode ARCHITECTURE.md's cost
 * model says must not happen.
 */
export async function pruneExpiredSnapshots(orgId?: string, limit = 200): Promise<number> {
  const db = getDb();
  const conditions = [isNull(snapshots.deletedAt), lte(snapshots.expiresAt, new Date())];
  if (orgId) conditions.push(eq(snapshots.orgId, orgId));

  const expired = await db
    .select()
    .from(snapshots)
    .where(and(...conditions))
    .orderBy(snapshots.expiresAt)
    .limit(limit);

  let pruned = 0;
  for (const snapshot of expired) {
    const [target] = await db
      .select()
      .from(storageTargets)
      .where(eq(storageTargets.id, snapshot.storageTargetId));
    if (target) {
      try {
        await driverFor(target).remove(snapshot.objectKey);
      } catch (err) {
        console.error(`[prune] could not delete ${snapshot.objectKey}`, err);
        continue; // leave the row alive so the next run tries again
      }
    }
    await db
      .update(snapshots)
      .set({ deletedAt: new Date() })
      .where(eq(snapshots.id, snapshot.id));
    pruned++;
  }

  if (pruned && expired[0]) {
    await audit({
      orgId: expired[0].orgId,
      action: "snapshot.pruned",
      subjectType: "snapshot",
      metadata: { count: pruned },
    });
  }
  return pruned;
}

/** Jobs stuck mid-flight because their process died. Reaped by the watchdog. */
export async function reapStuckJobs(olderThanMs = 45 * 60 * 1000): Promise<number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanMs);
  const stuck = await db
    .select()
    .from(backupJobs)
    .where(
      and(
        raw`${backupJobs.status} IN ('queued','running','uploading')`,
        lte(backupJobs.createdAt, cutoff),
        ne(backupJobs.status, "failed"),
      ),
    )
    .limit(50);

  for (const job of stuck) {
    const [connection] = await db
      .select()
      .from(databaseConnections)
      .where(eq(databaseConnections.id, job.databaseConnectionId));
    await fail(
      job,
      "abandoned",
      "The process running this backup stopped before it finished. Nothing was stored.",
      connection,
      null,
    );
  }
  return stuck.length;
}
