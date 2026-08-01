/**
 * Restore drills — the feature the product is named for.
 *
 * A drill takes the latest snapshot, creates an ephemeral scratch database on a
 * VaultBack-operated Postgres server, restores the snapshot into it through the
 * *same* code path a customer restore uses, counts every table's rows against the
 * manifest recorded at dump time, checks the stored object still hashes to its
 * recorded checksum, and then drops the scratch database.
 *
 * Two properties are non-negotiable:
 *
 *  - **The scratch database is ours.** It is created on SCRATCH_POSTGRES_URL and
 *    dropped in a `finally`. A drill must never touch a customer database.
 *  - **A drill can fail.** Passing has to mean something, so a corrupted
 *    snapshot, a row-count mismatch, or a checksum mismatch fails loudly and
 *    sends the highest-severity alert the product has.
 */

import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lte } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupPolicies,
  databaseConnections,
  restoreDrills,
  snapshots,
  type BackupPolicy,
  type RestoreDrill,
  type Snapshot,
} from "@/db/schema";
import { alertOnce, drillFailedEmail } from "@/lib/alerts";
import { audit } from "@/lib/audit";
import { openSnapshotSql } from "@/lib/backups";
import { env } from "@/lib/env";
import { applySql, verifyRestore } from "@/lib/restore-engine";
import { nextDrillAfter } from "@/lib/schedule";
import { connectSource, quoteIdent, type SourceClient } from "@/lib/source-db";

export class DrillError extends Error {}

/** A scratch database name that is obviously ours and obviously disposable. */
function scratchName(): string {
  return `vaultback_drill_${randomBytes(6).toString("hex")}`;
}

/**
 * Point a connection string at a different database on the same server. The
 * scratch admin URL names some database we can connect to in order to issue
 * CREATE DATABASE; the drill then needs a URL for the database it just created.
 */
function withDatabase(connectionString: string, database: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${database}`;
  return url.toString();
}

async function createScratchDatabase(name: string): Promise<void> {
  const admin = connectSource(env.scratchAdminUrl, { statementTimeoutMs: 60_000, max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE ${quoteIdent(name)}`);
  } catch (err) {
    throw new DrillError(
      `Could not create the scratch database: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    await admin.end({ timeout: 5 }).catch(() => {});
  }
}

async function dropScratchDatabase(name: string): Promise<void> {
  const admin = connectSource(env.scratchAdminUrl, { statementTimeoutMs: 60_000, max: 1 });
  try {
    // FORCE terminates any connection still attached — a drill that leaked a
    // connection must not leave a database behind, because these accumulate.
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`);
  } catch (err) {
    console.error(`[drill] could not drop scratch database ${name}`, err);
  } finally {
    await admin.end({ timeout: 5 }).catch(() => {});
  }
}

export interface DrillResult {
  drillId: string;
  passed: boolean;
  summary: string;
  rowsRestored: number;
  tablesRestored: number;
  durationMs: number;
}

export interface StartDrillInput {
  orgId: string;
  snapshot: Snapshot;
  policyId?: string | null;
  trigger?: "scheduled" | "manual";
}

export async function createDrill(input: StartDrillInput): Promise<RestoreDrill> {
  const db = getDb();
  const [drill] = await db
    .insert(restoreDrills)
    .values({
      orgId: input.orgId,
      snapshotId: input.snapshot.id,
      policyId: input.policyId ?? null,
      databaseConnectionId: input.snapshot.databaseConnectionId,
      status: "queued",
      trigger: input.trigger ?? "scheduled",
      tablesExpected: input.snapshot.manifest?.tables.length ?? 0,
      rowsExpected: input.snapshot.manifest?.totalRows ?? 0,
    })
    .returning();
  return drill;
}

export async function runDrill(drillId: string): Promise<DrillResult> {
  const db = getDb();
  const started = Date.now();

  const [drill] = await db.select().from(restoreDrills).where(eq(restoreDrills.id, drillId));
  if (!drill) throw new DrillError(`Drill ${drillId} does not exist`);

  const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, drill.snapshotId));
  if (!snapshot) throw new DrillError("The snapshot for this drill no longer exists");

  const [connection] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, drill.databaseConnectionId));

  const name = scratchName();
  let sql: SourceClient | null = null;
  let created = false;

  const failDrill = async (detail: string): Promise<DrillResult> => {
    await db
      .update(restoreDrills)
      .set({
        status: "failed",
        errorDetail: detail,
        scratchInstance: name,
        durationMs: Date.now() - started,
        finishedAt: new Date(),
      })
      .where(eq(restoreDrills.id, drill.id));

    await audit({
      orgId: drill.orgId,
      action: "drill.failed",
      subjectType: "drill",
      subjectId: drill.id,
      metadata: { name: connection?.name, detail, snapshotId: snapshot.id },
    });

    const message = drillFailedEmail({
      databaseName: connection?.name ?? "a database",
      reason: detail,
      snapshotTakenAt: snapshot.createdAt,
    });
    await alertOnce({
      orgId: drill.orgId,
      kind: "drill_failed",
      dedupeKey: `drill_failed:${drill.id}`,
      ...message,
    });

    return {
      drillId: drill.id,
      passed: false,
      summary: detail,
      rowsRestored: 0,
      tablesRestored: 0,
      durationMs: Date.now() - started,
    };
  };

  try {
    await db
      .update(restoreDrills)
      .set({ status: "restoring", startedAt: new Date(), scratchInstance: name })
      .where(eq(restoreDrills.id, drill.id));

    await createScratchDatabase(name);
    created = true;

    sql = connectSource(withDatabase(env.scratchAdminUrl, name), {
      statementTimeoutMs: 0,
      max: 1,
    });

    const snapshotStream = await openSnapshotSql(snapshot);
    const applied = await applySql(sql, snapshotStream.stream);

    const storedDigest = snapshotStream.storedDigest();
    const checksumOk = storedDigest === snapshot.sha256;
    if (!checksumOk) {
      return await failDrill(
        `The stored object no longer hashes to its recorded checksum (expected ${snapshot.sha256.slice(0, 12)}…, got ${storedDigest.slice(0, 12)}…)`,
      );
    }

    await db
      .update(restoreDrills)
      .set({ status: "verifying", checksumVerified: true })
      .where(eq(restoreDrills.id, drill.id));

    const manifest = snapshot.manifest ?? { tables: [], totalRows: 0 };
    const verification = await verifyRestore(sql, manifest);

    await db
      .update(restoreDrills)
      .set({
        status: verification.ok ? "passed" : "failed",
        tablesExpected: verification.tablesExpected,
        tablesRestored: verification.tablesRestored,
        rowsExpected: verification.rowsExpected,
        rowsRestored: verification.rowsRestored,
        rowcountChecks: verification.rows,
        checksumVerified: true,
        durationMs: Date.now() - started,
        errorDetail: verification.ok ? null : verification.summary,
        finishedAt: new Date(),
      })
      .where(eq(restoreDrills.id, drill.id));

    if (drill.policyId) {
      const [policy] = await db
        .select()
        .from(backupPolicies)
        .where(eq(backupPolicies.id, drill.policyId));
      if (policy) {
        await db
          .update(backupPolicies)
          .set({
            lastDrillAt: new Date(),
            nextDrillAt: nextDrillAfter(policy.drillFrequency, new Date()),
          })
          .where(eq(backupPolicies.id, policy.id));
      }
    }

    if (!verification.ok) {
      await audit({
        orgId: drill.orgId,
        action: "drill.failed",
        subjectType: "drill",
        subjectId: drill.id,
        metadata: { name: connection?.name, detail: verification.summary },
      });
      const message = drillFailedEmail({
        databaseName: connection?.name ?? "a database",
        reason: verification.summary,
        snapshotTakenAt: snapshot.createdAt,
      });
      await alertOnce({
        orgId: drill.orgId,
        kind: "drill_failed",
        dedupeKey: `drill_failed:${drill.id}`,
        ...message,
      });
    } else {
      await audit({
        orgId: drill.orgId,
        action: "drill.passed",
        subjectType: "drill",
        subjectId: drill.id,
        metadata: {
          name: connection?.name,
          tables: verification.tablesRestored,
          rows: verification.rowsRestored,
          statements: applied.statements,
        },
      });
    }

    return {
      drillId: drill.id,
      passed: verification.ok,
      summary: verification.summary,
      rowsRestored: verification.rowsRestored,
      tablesRestored: verification.tablesRestored,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return await failDrill(err instanceof Error ? err.message : String(err));
  } finally {
    await sql?.end({ timeout: 5 }).catch(() => {});
    if (created) await dropScratchDatabase(name);
  }
}

/* ----------------------------------------------------------------- reading --- */

export async function listDrills(orgId: string, limit = 30): Promise<RestoreDrill[]> {
  const db = getDb();
  return db
    .select()
    .from(restoreDrills)
    .where(eq(restoreDrills.orgId, orgId))
    .orderBy(desc(restoreDrills.createdAt))
    .limit(limit);
}

export async function latestDrillFor(connectionId: string): Promise<RestoreDrill | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(restoreDrills)
    .where(eq(restoreDrills.databaseConnectionId, connectionId))
    .orderBy(desc(restoreDrills.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getDrill(drillId: string, orgId: string): Promise<RestoreDrill | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(restoreDrills)
    .where(and(eq(restoreDrills.id, drillId), eq(restoreDrills.orgId, orgId)));
  return row ?? null;
}

/** Policies whose drill cadence has come due, for the scheduler. */
export async function duePolicyDrills(limit = 20): Promise<BackupPolicy[]> {
  const db = getDb();
  return db
    .select()
    .from(backupPolicies)
    .where(
      and(
        eq(backupPolicies.enabled, true),
        lte(backupPolicies.nextDrillAt, new Date()),
      ),
    )
    .limit(limit);
}

/** The latest snapshot a drill can use, or null when there is nothing to test. */
export async function drillCandidate(connectionId: string): Promise<Snapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.databaseConnectionId, connectionId), isNull(snapshots.deletedAt)))
    .orderBy(desc(snapshots.createdAt))
    .limit(1);
  return row ?? null;
}
