/**
 * One-click restore into a database the customer supplies.
 *
 * The safety rules are the product here, not the plumbing:
 *
 *  1. **Never the source.** A target whose host and database match the snapshot's
 *     source is refused outright, with no override. The single worst outcome this
 *     product could produce is overwriting the live database it was protecting.
 *  2. **Empty by default.** A non-empty target requires an explicit
 *     acknowledgement, and even then we say what we found.
 *  3. **Attributable.** Every restore writes an audit entry naming the actor, the
 *     snapshot, and the target fingerprint. Restores are the most sensitive
 *     action in the product.
 *  4. **Credentials are not kept.** The target connection string is encrypted for
 *     the life of the run and cleared when it ends.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  databaseConnections,
  restoreRuns,
  snapshots,
  type RestoreRun,
  type Snapshot,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { openSnapshotSql } from "@/lib/backups";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { env } from "@/lib/env";
import { fingerprint, parseConnectionString } from "@/lib/providers";
import { applySql, verifyRestore } from "@/lib/restore-engine";
import { connectSource, isEmptyDatabase } from "@/lib/source-db";
import { friendlyConnectionError } from "@/lib/connections";

export class RestoreRefused extends Error {}

export interface StartRestoreInput {
  orgId: string;
  actorUserId: string;
  snapshot: Snapshot;
  targetConnectionString: string;
  allowNonEmpty: boolean;
}

/**
 * Validate the target and create the run row. Split from `runRestore` so the UI
 * can reject a bad target immediately, and the actual restore can happen in a
 * cron tick or a worker without holding the request open.
 */
export async function startRestore(input: StartRestoreInput): Promise<RestoreRun> {
  const db = getDb();
  const target = parseConnectionString(input.targetConnectionString);
  const targetFingerprint = fingerprint(target);

  const [source] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, input.snapshot.databaseConnectionId));

  if (source) {
    const sourceParsed = source.hostFingerprint;
    // host:port/db vs host:port/db — compare host and database, ignore the port,
    // because a pooler and the direct endpoint are the same database.
    if (sameDatabase(sourceParsed, targetFingerprint)) {
      throw new RestoreRefused(
        "That target is the database this snapshot came from. VaultBack never restores over a live source — create an empty database and point the restore at that.",
      );
    }
  }

  const sql = connectSource(input.targetConnectionString, {
    statementTimeoutMs: 30_000,
    max: 1,
  });
  try {
    const empty = await isEmptyDatabase(sql);
    if (!empty && !input.allowNonEmpty) {
      throw new RestoreRefused(
        "That target already contains tables. Restore into a fresh, empty database, or confirm that you want to restore into this one.",
      );
    }
  } catch (err) {
    if (err instanceof RestoreRefused) throw err;
    throw new RestoreRefused(
      `Could not reach the target database: ${friendlyConnectionError(
        err instanceof Error ? err.message : String(err),
      )}`,
    );
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }

  const [run] = await db
    .insert(restoreRuns)
    .values({
      orgId: input.orgId,
      snapshotId: input.snapshot.id,
      actorUserId: input.actorUserId,
      status: "queued",
      targetFingerprint,
      encryptedTarget: encryptCredential(input.targetConnectionString, env.credentialsKey),
      allowNonEmpty: input.allowNonEmpty,
    })
    .returning();

  return run;
}

function sameDatabase(a: string, b: string): boolean {
  const norm = (s: string) => {
    const [hostPort, ...rest] = s.split("/");
    const host = hostPort.split(":")[0].replace(/-pooler\./, ".").replace(/^pooler\./, "");
    return `${host}/${rest.join("/")}`;
  };
  return norm(a) === norm(b);
}

export interface RestoreResult {
  runId: string;
  ok: boolean;
  statements: number;
  rowsRestored: number;
  tablesRestored: number;
  error?: string;
}

export async function runRestore(runId: string): Promise<RestoreResult> {
  const db = getDb();
  const started = Date.now();

  const [run] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, runId));
  if (!run) throw new Error(`Restore run ${runId} does not exist`);
  if (!run.encryptedTarget) {
    throw new Error("This restore has no target credential — it has already finished");
  }

  const [snapshotRow] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.id, run.snapshotId));
  if (!snapshotRow) throw new Error("The snapshot for this restore no longer exists");

  const targetConnectionString = decryptCredential(run.encryptedTarget, env.credentialsKey);
  const sql = connectSource(targetConnectionString, { statementTimeoutMs: 0, max: 1 });

  await db
    .update(restoreRuns)
    .set({ status: "restoring", startedAt: new Date() })
    .where(eq(restoreRuns.id, run.id));

  try {
    const snapshotStream = await openSnapshotSql(snapshotRow);
    const applied = await applySql(sql, snapshotStream.stream, async (p) => {
      await db
        .update(restoreRuns)
        .set({ statementsApplied: p.statements })
        .where(eq(restoreRuns.id, run.id));
    });

    // The object we just read has to hash to what we stored, or the restore was
    // built from bytes that are not the backup we promised.
    if (snapshotStream.storedDigest() !== snapshotRow.sha256) {
      throw new Error(
        "The snapshot object in storage does not match its recorded checksum — the restore was aborted",
      );
    }

    await db
      .update(restoreRuns)
      .set({ status: "verifying", statementsApplied: applied.statements })
      .where(eq(restoreRuns.id, run.id));

    const manifest = snapshotRow.manifest ?? { tables: [], totalRows: 0 };
    const verification = await verifyRestore(sql, manifest);

    await db
      .update(restoreRuns)
      .set({
        status: verification.ok ? "succeeded" : "failed",
        statementsTotal: applied.statements,
        statementsApplied: applied.statements,
        tablesRestored: verification.tablesRestored,
        rowsRestored: verification.rowsRestored,
        durationMs: Date.now() - started,
        errorDetail: verification.ok ? null : verification.summary,
        finishedAt: new Date(),
        // The target credential is not ours to keep past the operation.
        encryptedTarget: null,
      })
      .where(eq(restoreRuns.id, run.id));

    await audit({
      orgId: run.orgId,
      actorUserId: run.actorUserId,
      action: verification.ok ? "restore.executed" : "restore.failed",
      subjectType: "restore",
      subjectId: run.id,
      metadata: {
        target: run.targetFingerprint,
        snapshotId: run.snapshotId,
        tables: verification.tablesRestored,
        rows: verification.rowsRestored,
        warnings: applied.warnings.length,
        detail: verification.ok ? undefined : verification.summary,
      },
    });

    if (applied.warnings.length) {
      console.info(
        `[restore] ${run.id} completed with ${applied.warnings.length} tolerated statement failures`,
      );
    }

    return {
      runId: run.id,
      ok: verification.ok,
      statements: applied.statements,
      rowsRestored: verification.rowsRestored,
      tablesRestored: verification.tablesRestored,
      error: verification.ok ? undefined : verification.summary,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db
      .update(restoreRuns)
      .set({
        status: "failed",
        errorDetail: detail,
        durationMs: Date.now() - started,
        finishedAt: new Date(),
        encryptedTarget: null,
      })
      .where(eq(restoreRuns.id, run.id));

    await audit({
      orgId: run.orgId,
      actorUserId: run.actorUserId,
      action: "restore.failed",
      subjectType: "restore",
      subjectId: run.id,
      metadata: { target: run.targetFingerprint, snapshotId: run.snapshotId, detail },
    });

    return {
      runId: run.id,
      ok: false,
      statements: 0,
      rowsRestored: 0,
      tablesRestored: 0,
      error: detail,
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

export async function recentRestores(orgId: string, limit = 20): Promise<RestoreRun[]> {
  const db = getDb();
  return db
    .select()
    .from(restoreRuns)
    .where(eq(restoreRuns.orgId, orgId))
    .orderBy(desc(restoreRuns.createdAt))
    .limit(limit);
}
