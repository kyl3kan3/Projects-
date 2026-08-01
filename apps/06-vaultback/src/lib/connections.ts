/**
 * Connecting a customer database: validate, encrypt, store, and give it a
 * default policy so the first backup can run without another screen.
 *
 * ARCHITECTURE.md puts the reachability check in the worker, for a good reason
 * (customer databases can be slow, and an IP allowlist wants one static egress).
 * In the serverless shape there is no worker, so the check runs inline in the
 * server action with a hard statement timeout. The check function is the same one
 * the worker calls, so nothing changes when a worker exists.
 */

import { and, desc, eq, isNull, sql as raw } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupJobs,
  backupPolicies,
  databaseConnections,
  snapshots,
  storageTargets,
  type BackupPolicy,
  type DatabaseConnection,
  type PlanId,
  type Provider,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { encryptCredential, decryptCredential } from "@/lib/crypto";
import { env } from "@/lib/env";
import {
  ConnectionStringError,
  detectPooled,
  detectProvider,
  fingerprint,
  parseConnectionString,
  requiresTls,
} from "@/lib/providers";
import { allowedFrequency, canAddDatabase, plan } from "@/lib/plans";
import { cronFor, nextDrillAfter, nextRunAfter } from "@/lib/schedule";
import { connectSource, inspectDatabase, probeReadPermission } from "@/lib/source-db";

export class PlanLimitError extends Error {}
export class ValidationError extends Error {}

export interface CheckItem {
  key: "reachable" | "tls" | "permissions" | "size" | "pooler";
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
}

export interface CheckResult {
  ok: boolean;
  items: CheckItem[];
  postgresVersion: string | null;
  sizeBytes: number | null;
  tableCount: number | null;
  isSuperuser: boolean;
  error: string | null;
}

/** Read and decrypt a stored connection string. The only place that happens. */
export function connectionStringFor(connection: DatabaseConnection): string {
  return decryptCredential(connection.encryptedConnectionString, env.credentialsKey);
}

/**
 * Run the connection checks. Never throws for a bad customer database — a
 * failure is a result to display, not an exception to swallow.
 */
export async function checkConnectionString(connectionString: string): Promise<CheckResult> {
  const items: CheckItem[] = [];
  let parsed;
  try {
    parsed = parseConnectionString(connectionString);
  } catch (err) {
    return {
      ok: false,
      items: [
        {
          key: "reachable",
          label: "Connection string",
          state: "fail",
          detail: err instanceof Error ? err.message : "Could not parse that connection string",
        },
      ],
      postgresVersion: null,
      sizeBytes: null,
      tableCount: null,
      isSuperuser: false,
      error: err instanceof Error ? err.message : "Invalid connection string",
    };
  }

  const pooled = detectPooled(parsed.host, parsed.port);
  const sql = connectSource(connectionString, {
    statementTimeoutMs: 15_000,
    connectTimeoutSeconds: 10,
    max: 1,
  });

  try {
    const inspection = await inspectDatabase(sql, { exactCounts: false });

    items.push({
      key: "reachable",
      label: "Reachable",
      state: "pass",
      detail: inspection.postgresVersion,
    });

    const tlsRequired = requiresTls(parsed.host);
    items.push({
      key: "tls",
      label: "Encrypted in transit",
      state: inspection.encrypted ? "pass" : tlsRequired ? "fail" : "warn",
      detail: inspection.encrypted
        ? "TLS negotiated"
        : tlsRequired
          ? "The server accepted an unencrypted connection — VaultBack will not back this up"
          : "Plaintext, allowed for localhost only",
    });

    const permission = await probeReadPermission(sql, inspection.tables);
    items.push({
      key: "permissions",
      label: "Read access",
      state: permission.ok ? "pass" : "fail",
      detail: permission.ok
        ? inspection.isSuperuser
          ? `${inspection.tables.length} tables readable — this role is a superuser, a read-only role is safer`
          : `${inspection.tables.length} tables readable`
        : `Cannot read ${permission.blocked.slice(0, 3).join(", ")}`,
    });

    items.push({
      key: "size",
      label: "Size estimate",
      state: "pass",
      detail: `${inspection.sizeBytes} bytes on disk, ~${inspection.totalRows} rows`,
    });

    if (pooled) {
      items.push({
        key: "pooler",
        label: "Direct connection",
        state: "warn",
        detail: "This looks like a transaction pooler — dumps can be inconsistent",
      });
    }

    const failed = items.some((i) => i.state === "fail");
    return {
      ok: !failed,
      items,
      postgresVersion: inspection.postgresVersion,
      sizeBytes: inspection.sizeBytes,
      tableCount: inspection.tables.length,
      isSuperuser: inspection.isSuperuser,
      error: failed ? (items.find((i) => i.state === "fail")?.detail ?? "Check failed") : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    items.push({
      key: "reachable",
      label: "Reachable",
      state: "fail",
      detail: friendlyConnectionError(message),
    });
    return {
      ok: false,
      items,
      postgresVersion: null,
      sizeBytes: null,
      tableCount: null,
      isSuperuser: false,
      error: friendlyConnectionError(message),
    };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

/** Turn driver noise into something a founder can act on. */
export function friendlyConnectionError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("password authentication failed")) {
    return "The password was rejected. Copy the connection string again from your provider.";
  }
  if (m.includes("does not exist") && m.includes("database")) {
    return "That database name does not exist on the server.";
  }
  if (m.includes("enotfound") || m.includes("eai_again")) {
    return "That hostname does not resolve. Check for a typo, or a private-network-only host.";
  }
  if (m.includes("etimedout") || m.includes("timeout")) {
    return "The server did not answer in time — it may only allow connections from an allowlisted IP.";
  }
  if (m.includes("econnrefused")) {
    return "The connection was refused. Check the port; providers often expose the direct port separately.";
  }
  if (m.includes("no pg_hba.conf entry") || m.includes("ssl")) {
    return "The server rejected the TLS settings. Try appending ?sslmode=require to the connection string.";
  }
  if (m.includes("too many clients")) {
    return "The server is out of connection slots right now.";
  }
  return message;
}

/* --------------------------------------------------------------- creation --- */

export interface CreateConnectionInput {
  orgId: string;
  planId: PlanId;
  actorUserId: string;
  name: string;
  connectionString: string;
  /** Bypass the pooler warning after the user has been shown it once. */
  acknowledgePooler?: boolean;
}

export interface CreateConnectionResult {
  connection: DatabaseConnection;
  policy: BackupPolicy;
  check: CheckResult;
  provider: Provider;
  warnings: string[];
}

export async function createConnection(
  input: CreateConnectionInput,
): Promise<CreateConnectionResult> {
  const db = getDb();

  const parsed = parseConnectionString(input.connectionString); // throws ConnectionStringError
  const provider = detectProvider(parsed.host);
  const pooled = detectPooled(parsed.host, parsed.port);
  const name = input.name.trim() || `${provider}-${parsed.database}`;
  if (name.length > 64) throw new ValidationError("Use a shorter name (64 characters max)");

  // Plan limits are enforced before anything touches the network.
  const existing = await countConnections(input.orgId);
  if (!canAddDatabase(input.planId, existing)) {
    const limits = plan(input.planId);
    throw new PlanLimitError(
      `The ${limits.name} plan covers ${limits.databases} database${limits.databases === 1 ? "" : "s"}. Upgrade to connect another.`,
    );
  }

  const check = await checkConnectionString(input.connectionString);
  if (!check.ok) {
    throw new ValidationError(check.error ?? "That database could not be validated");
  }

  const [target] = await db
    .select()
    .from(storageTargets)
    .where(and(eq(storageTargets.orgId, input.orgId), eq(storageTargets.isDefault, true)));
  if (!target) throw new ValidationError("This organization has no default storage target");

  const [connection] = await db
    .insert(databaseConnections)
    .values({
      orgId: input.orgId,
      name,
      provider,
      encryptedConnectionString: encryptCredential(input.connectionString, env.credentialsKey),
      hostFingerprint: fingerprint(parsed),
      pooled,
      postgresVersion: check.postgresVersion,
      approxSizeBytes: check.sizeBytes,
      tableCount: check.tableCount,
      roleIsSuperuser: check.isSuperuser,
      status: "active",
      lastCheckedAt: new Date(),
    })
    .returning();

  // The default policy runs at the best frequency the plan allows, so the first
  // green checkmark is minutes away rather than a configuration exercise.
  const frequency = allowedFrequency(input.planId, "hourly");
  const limits = plan(input.planId);
  const cron = cronFor({ frequency, hour: 4, minute: new Date().getUTCMinutes() });
  const drillFrequency = limits.maxDrill;

  const [policy] = await db
    .insert(backupPolicies)
    .values({
      orgId: input.orgId,
      databaseConnectionId: connection.id,
      storageTargetId: target.id,
      frequency,
      scheduleCron: cron,
      timezone: "UTC",
      retentionDays: limits.retentionDays,
      enabled: true,
      // Due immediately: the first backup should not wait for the next slot.
      nextRunAt: new Date(),
      drillFrequency,
      nextDrillAt: nextDrillAfter(drillFrequency, new Date()),
    })
    .returning();

  const warnings: string[] = [];
  if (pooled) warnings.push("Pooled connection detected — use the direct endpoint for reliable dumps.");
  if (check.isSuperuser) warnings.push("This role is a superuser. A read-only backup role is safer.");

  await audit({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "connection.created",
    subjectType: "connection",
    subjectId: connection.id,
    metadata: { name: connection.name, provider, host: connection.hostFingerprint, pooled },
  });

  return { connection, policy, check, provider, warnings };
}

export async function countConnections(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: raw<number>`count(*)::int` })
    .from(databaseConnections)
    .where(and(eq(databaseConnections.orgId, orgId), eq(databaseConnections.status, "active")));
  return row?.n ?? 0;
}

/** Re-run the checks against a stored connection and record the outcome. */
export async function recheckConnection(
  connection: DatabaseConnection,
  actorUserId?: string,
): Promise<CheckResult> {
  const db = getDb();
  const result = await checkConnectionString(connectionStringFor(connection));
  await db
    .update(databaseConnections)
    .set({
      status: result.ok ? "active" : "unreachable",
      postgresVersion: result.postgresVersion ?? connection.postgresVersion,
      approxSizeBytes: result.sizeBytes ?? connection.approxSizeBytes,
      tableCount: result.tableCount ?? connection.tableCount,
      roleIsSuperuser: result.isSuperuser,
      lastCheckError: result.error,
      lastCheckedAt: new Date(),
    })
    .where(eq(databaseConnections.id, connection.id));

  await audit({
    orgId: connection.orgId,
    actorUserId: actorUserId ?? null,
    action: "connection.checked",
    subjectType: "connection",
    subjectId: connection.id,
    metadata: { name: connection.name, ok: result.ok, detail: result.error },
  });
  return result;
}

export async function deleteConnection(
  connectionId: string,
  orgId: string,
  actorUserId: string,
): Promise<void> {
  const db = getDb();
  const [connection] = await db
    .select()
    .from(databaseConnections)
    .where(and(eq(databaseConnections.id, connectionId), eq(databaseConnections.orgId, orgId)));
  if (!connection) throw new ValidationError("That database is not in this organization");

  await db.delete(databaseConnections).where(eq(databaseConnections.id, connectionId));
  await audit({
    orgId,
    actorUserId,
    action: "connection.deleted",
    subjectType: "connection",
    subjectId: connectionId,
    metadata: { name: connection.name },
  });
}

/* ----------------------------------------------------------------- reading --- */

export interface ConnectionHealth {
  connection: DatabaseConnection;
  policy: BackupPolicy | null;
  lastSuccessAt: Date | null;
  lastSnapshotBytes: number | null;
  lastSnapshotChecksum: string | null;
  lastSnapshotAt: Date | null;
  snapshotCount: number;
  storedBytes: number;
  runningJob: { id: string; stage: string } | null;
  lastFailure: { at: Date; detail: string } | null;
  verified: boolean;
}

export async function listConnections(orgId: string): Promise<DatabaseConnection[]> {
  const db = getDb();
  return db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.orgId, orgId))
    .orderBy(databaseConnections.createdAt);
}

export async function getConnection(
  connectionId: string,
  orgId: string,
): Promise<DatabaseConnection | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(databaseConnections)
    .where(and(eq(databaseConnections.id, connectionId), eq(databaseConnections.orgId, orgId)));
  return row ?? null;
}

export async function policyFor(connectionId: string): Promise<BackupPolicy | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(backupPolicies)
    .where(eq(backupPolicies.databaseConnectionId, connectionId));
  return row ?? null;
}

/**
 * The dashboard's per-database health. One query per fact rather than one giant
 * join: the row counts here are tiny, and readable SQL in a product about
 * databases is worth more than a saved round trip.
 */
export async function healthFor(connection: DatabaseConnection): Promise<ConnectionHealth> {
  const db = getDb();

  const policy = await policyFor(connection.id);

  const live = await db
    .select()
    .from(snapshots)
    .where(
      and(
        eq(snapshots.databaseConnectionId, connection.id),
        isNull(snapshots.deletedAt),
      ),
    )
    .orderBy(desc(snapshots.createdAt));

  const latest = live[0] ?? null;
  const storedBytes = live.reduce((sum, s) => sum + (s.compressedSizeBytes ?? 0), 0);

  const [running] = await db
    .select()
    .from(backupJobs)
    .where(
      and(
        eq(backupJobs.databaseConnectionId, connection.id),
        raw`${backupJobs.status} IN ('queued','running','uploading')`,
      ),
    )
    .orderBy(desc(backupJobs.createdAt))
    .limit(1);

  const [failure] = await db
    .select()
    .from(backupJobs)
    .where(
      and(eq(backupJobs.databaseConnectionId, connection.id), eq(backupJobs.status, "failed")),
    )
    .orderBy(desc(backupJobs.createdAt))
    .limit(1);

  const lastSuccessAt = policy?.lastSuccessAt ?? latest?.createdAt ?? null;
  // Green is earned by a checksum, never by an attempt: a snapshot counts as
  // verified only once its stored object hashed to what we recorded.
  const verified = Boolean(latest?.sha256);

  return {
    connection,
    policy,
    lastSuccessAt,
    lastSnapshotBytes: latest?.compressedSizeBytes ?? null,
    lastSnapshotChecksum: latest?.sha256 ?? null,
    lastSnapshotAt: latest?.createdAt ?? null,
    snapshotCount: live.length,
    storedBytes,
    runningJob: running ? { id: running.id, stage: running.stage } : null,
    lastFailure:
      failure && (!latest || failure.createdAt > latest.createdAt)
        ? { at: failure.createdAt, detail: failure.errorDetail ?? "Backup failed" }
        : null,
    verified,
  };
}

export { ConnectionStringError };
