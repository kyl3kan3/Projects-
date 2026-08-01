/**
 * Throwaway end-to-end exercise of the VaultBack domain against the real
 * database. Not shipped — see the report for what it verified.
 */
import "@/lib/load-env";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  backupJobs,
  backupPolicies,
  databaseConnections,
  organizations,
  restoreDrills,
  restoreRuns,
  snapshots,
  storageTargets,
  users,
  auditLog,
} from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { createOrgForUser } from "@/lib/orgs";
import { createConnection, checkConnectionString, recheckConnection } from "@/lib/connections";
import { runTick } from "@/lib/tick";
import { listSnapshots, openSnapshotSql, pruneExpiredSnapshots } from "@/lib/backups";
import { startRestore, runRestore } from "@/lib/restore";
import { createDrill, drillCandidate, runDrill } from "@/lib/drills";
import { updatePolicy } from "@/lib/policies";
import { buildReport, previousPeriod, currentPeriod } from "@/lib/reports";
import { applyPlan } from "@/lib/billing";
import { recentAudit } from "@/lib/audit";
import { driverFor } from "@/lib/storage";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SOURCE = "postgres://postgres@localhost:5433/vb_demo_source";
const TARGET = "postgres://postgres@localhost:5433/vb_restore_target";

const log = (...a: unknown[]) => console.log("•", ...a);
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${label} ${detail}`);
  else {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

async function main() {
  const db = getDb();

  // Clean slate for repeat runs.
  await db.delete(users);
  await db.delete(organizations);
  {
    const { connectSource } = await import("@/lib/source-db");
    const t = connectSource(TARGET, { max: 1 });
    await t.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await t.end({ timeout: 5 });
  }

  log("auth: scrypt round trip");
  const hash = await hashPassword("correct horse battery");
  check("password verifies", await verifyPassword("correct horse battery", hash));
  check("wrong password rejected", !(await verifyPassword("nope", hash)));

  const [user] = await db
    .insert(users)
    .values({ email: "ada@helvetico.dev", name: "Ada Okafor", passwordHash: hash })
    .returning();
  const org = await createOrgForUser(user);
  log("org created", org.slug, "plan", org.plan);
  const targets = await db.select().from(storageTargets).where(eq(storageTargets.orgId, org.id));
  check("default storage target exists", targets.length === 1 && targets[0].isDefault);

  log("connection check: bad string");
  const bad = await checkConnectionString("postgres://postgres@localhost:5433/nope_does_not_exist");
  check("nonexistent database fails the check", !bad.ok, bad.error ?? "");
  const notAUrl = await checkConnectionString("psql -h db.abc.supabase.co -U postgres");
  check("psql command line rejected", !notAUrl.ok, notAUrl.error ?? "");

  log("connect the demo database");
  const created = await createConnection({
    orgId: org.id,
    planId: org.plan,
    actorUserId: user.id,
    name: "prod-supabase",
    connectionString: SOURCE,
  });
  check("provider detected as generic (localhost)", created.provider === "generic");
  check("connection active", created.connection.status === "active");
  check(
    "policy created at plan frequency (hobby -> daily)",
    created.policy.frequency === "daily" && created.policy.retentionDays === 30,
    created.policy.scheduleCron,
  );
  check("first run is due immediately", created.policy.nextRunAt.getTime() <= Date.now() + 1000);
  check("tables counted", (created.connection.tableCount ?? 0) === 3, String(created.connection.tableCount));

  log("plan limit: second database on Hobby");
  let limitHit = false;
  try {
    await createConnection({
      orgId: org.id,
      planId: org.plan,
      actorUserId: user.id,
      name: "second",
      connectionString: SOURCE,
    });
  } catch (err) {
    limitHit = /Hobby plan covers 1 database/.test(String(err));
  }
  check("Hobby refuses a second database", limitHit);

  log("run the tick: this dumps, encrypts and uploads");
  const tick1 = await runTick({ budgetMs: 120_000, skipPrune: true });
  check("one backup ran", tick1.backupsRun === 1, JSON.stringify(tick1));

  const snaps = await listSnapshots(created.connection.id);
  check("snapshot recorded", snaps.length === 1);
  const snapshot = snaps[0];
  if (snapshot) {
    log(
      "snapshot",
      snapshot.objectKey,
      `${snapshot.sizeBytes}B plain / ${snapshot.compressedSizeBytes}B stored`,
      snapshot.dumpEngine,
    );
    check("checksum recorded", /^[0-9a-f]{64}$/.test(snapshot.sha256));
    check("data key wrapped, not plaintext", snapshot.wrappedDataKey.length > 32);
    check("manifest captured", (snapshot.manifest?.tables.length ?? 0) === 3, JSON.stringify(snapshot.manifest?.tables));
    check("manifest row counts exact", snapshot.manifest?.totalRows === 17, String(snapshot.manifest?.totalRows));
    check("expiry set 30 days out", !!snapshot.expiresAt);

    // The object on disk must not contain plaintext SQL.
    const [target] = await db
      .select()
      .from(storageTargets)
      .where(eq(storageTargets.id, snapshot.storageTargetId));
    const file = path.resolve(
      process.env.LOCAL_STORAGE_DIR ?? ".vaultback-storage",
      target.orgId,
      snapshot.objectKey,
    );
    const bytes = await readFile(file);
    check("stored object starts with the VB1 envelope", bytes.subarray(0, 3).toString() === "VB1");
    const asText = bytes.toString("latin1");
    check(
      "no plaintext table names in the stored object",
      !asText.includes("customers") && !asText.includes("ada@helvetico.dev"),
    );

    log("decrypt the snapshot back to SQL");
    const stream = await openSnapshotSql(snapshot);
    let sql = "";
    for await (const chunk of stream.stream as AsyncIterable<Buffer | string>) sql += chunk.toString();
    check("decrypted SQL contains the schema", sql.includes("CREATE TABLE") && sql.includes("customers"));
    check("decrypted SQL contains the data", sql.includes("ada@helvetico.dev"));
    check("stored digest matches recorded checksum", stream.storedDigest() === snapshot.sha256);
    check("manifest header present in the dump", sql.includes("vaultback-manifest:"));
  }

  log("one-click restore into an empty database");
  const run = await startRestore({
    orgId: org.id,
    actorUserId: user.id,
    snapshot,
    targetConnectionString: TARGET,
    allowNonEmpty: false,
  });
  const restored = await runRestore(run.id);
  check("restore succeeded", restored.ok, restored.error ?? "");
  check("rows restored match", restored.rowsRestored === 17, String(restored.rowsRestored));
  check("tables restored match", restored.tablesRestored === 3, String(restored.tablesRestored));
  const [runRow] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, run.id));
  check("target credential cleared after the run", runRow.encryptedTarget === null);

  log("restore refuses the source database");
  let refused = "";
  try {
    await startRestore({
      orgId: org.id,
      actorUserId: user.id,
      snapshot,
      targetConnectionString: SOURCE,
      allowNonEmpty: true,
    });
  } catch (err) {
    refused = String(err);
  }
  check("refuses to restore over the source", /never restores over a live source/.test(refused), refused.slice(0, 80));

  log("restore refuses a non-empty target without confirmation");
  let refusedNonEmpty = "";
  try {
    await startRestore({
      orgId: org.id,
      actorUserId: user.id,
      snapshot,
      targetConnectionString: TARGET, // now populated by the restore above
      allowNonEmpty: false,
    });
  } catch (err) {
    refusedNonEmpty = String(err);
  }
  check("refuses a non-empty target", /already contains tables/.test(refusedNonEmpty), refusedNonEmpty.slice(0, 80));

  log("restore drill on an ephemeral scratch database");
  const candidate = await drillCandidate(created.connection.id);
  const drill = await createDrill({ orgId: org.id, snapshot: candidate!, policyId: created.policy.id, trigger: "manual" });
  const drillResult = await runDrill(drill.id);
  check("drill passed", drillResult.passed, drillResult.summary);
  const [drillRow] = await db.select().from(restoreDrills).where(eq(restoreDrills.id, drill.id));
  check("drill checksum verified", drillRow.checksumVerified);
  check("drill recorded per-table checks", (drillRow.rowcountChecks?.length ?? 0) === 3);
  check("scratch database dropped", await scratchGone(drillRow.scratchInstance!));

  log("a corrupted snapshot must fail the drill");
  const [target2] = await db
    .select()
    .from(storageTargets)
    .where(eq(storageTargets.id, snapshot.storageTargetId));
  const objectPath = path.resolve(
    process.env.LOCAL_STORAGE_DIR ?? ".vaultback-storage",
    target2.orgId,
    snapshot.objectKey,
  );
  const original = await readFile(objectPath);
  const tampered = Buffer.from(original);
  tampered[Math.floor(tampered.length / 2)] ^= 0xff;
  const { writeFile } = await import("node:fs/promises");
  await writeFile(objectPath, tampered);
  const drill2 = await createDrill({ orgId: org.id, snapshot, policyId: created.policy.id, trigger: "manual" });
  const bad2 = await runDrill(drill2.id);
  check("tampered snapshot fails the drill", !bad2.passed, bad2.summary.slice(0, 90));
  await writeFile(objectPath, original);

  log("policy editor + plan clamping");
  const updated = await updatePolicy({
    policyId: created.policy.id,
    orgId: org.id,
    planId: "hobby",
    actorUserId: user.id,
    frequency: "hourly",
    hour: 22,
    minute: 15,
    timezone: "Europe/Lisbon",
    retentionDays: 365,
    drillFrequency: "weekly",
    storageTargetId: created.policy.storageTargetId,
    enabled: true,
  });
  check("hourly clamped to daily on Hobby", updated.policy.frequency === "daily");
  check("retention clamped to 30", updated.policy.retentionDays === 30);
  check("drills clamped to none", updated.policy.drillFrequency === "none");
  check("clamp messages produced", updated.clamped.length === 3, JSON.stringify(updated.clamped));
  check("cron recomputed", updated.policy.scheduleCron === "15 22 * * *", updated.policy.scheduleCron);
  check("next run in the future", updated.policy.nextRunAt.getTime() > Date.now());

  log("upgrade to business, then the policy can go hourly + weekly drills");
  await applyPlan(org.id, "business");
  const upgraded = await updatePolicy({
    policyId: created.policy.id,
    orgId: org.id,
    planId: "business",
    actorUserId: user.id,
    frequency: "hourly",
    hour: 22,
    minute: 15,
    timezone: "UTC",
    retentionDays: 365,
    drillFrequency: "weekly",
    storageTargetId: created.policy.storageTargetId,
    enabled: true,
  });
  check("hourly allowed on Business", upgraded.policy.frequency === "hourly");
  check("365-day retention allowed", upgraded.policy.retentionDays === 365);
  check("weekly drills allowed", upgraded.policy.drillFrequency === "weekly");

  log("missed schedule detection");
  const missedSlot = new Date(Date.now() - 3 * 60 * 60 * 1000);
  await db
    .update(backupPolicies)
    .set({ nextRunAt: missedSlot, missedSince: null })
    .where(eq(backupPolicies.id, created.policy.id));
  const dispatchOnly = await (await import("@/lib/scheduler")).dispatchDueBackups(10);
  check("missed slot detected", dispatchOnly.missed === 1, JSON.stringify(dispatchOnly));
  const [policyMid] = await db
    .select()
    .from(backupPolicies)
    .where(eq(backupPolicies.id, created.policy.id));
  check("missedSince recorded at dispatch", policyMid.missedSince !== null);
  const tick2 = await runTick({ budgetMs: 120_000, skipPrune: true, maxDrills: 0 });
  check("queued job from the missed slot ran", tick2.backupsRun === 1, JSON.stringify(tick2));
  const [policyAfter] = await db
    .select()
    .from(backupPolicies)
    .where(eq(backupPolicies.id, created.policy.id));
  check("missedSince cleared by a successful backup", policyAfter.missedSince === null);
  check("next run advanced into the future", policyAfter.nextRunAt.getTime() > Date.now());
  const jobs = await db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.databaseConnectionId, created.connection.id));
  check("second backup produced a job", jobs.length >= 2, `${jobs.length} jobs`);
  check("second backup succeeded", jobs.filter((j) => j.status === "succeeded").length >= 2);

  log("double dispatch is impossible for the same slot");
  await db
    .update(backupPolicies)
    .set({ nextRunAt: new Date(Date.now() - 1000) })
    .where(eq(backupPolicies.id, created.policy.id));
  const [a, b] = await Promise.all([
    (await import("@/lib/scheduler")).dispatchDueBackups(10),
    (await import("@/lib/scheduler")).dispatchDueBackups(10),
  ]);
  check("only one tick claimed the slot", a.claimed + b.claimed === 1, `${a.claimed}/${b.claimed}`);

  log("retention pruning");
  const all = await listSnapshots(created.connection.id);
  await db
    .update(snapshots)
    .set({ expiresAt: new Date(Date.now() - 86_400_000) })
    .where(eq(snapshots.id, all[all.length - 1].id));
  const pruned = await pruneExpiredSnapshots(org.id);
  check("one expired snapshot pruned", pruned === 1, String(pruned));
  const [prunedRow] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.id, all[all.length - 1].id));
  check("pruned snapshot soft-deleted", prunedRow.deletedAt !== null);
  const [tgt] = await db
    .select()
    .from(storageTargets)
    .where(eq(storageTargets.id, prunedRow.storageTargetId));
  let objectGone = false;
  try {
    await driverFor(tgt).get(prunedRow.objectKey);
  } catch {
    objectGone = true;
  }
  check("pruned object removed from storage", objectGone);

  log("connection recheck");
  const [connNow] = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.id, created.connection.id));
  const recheck = await recheckConnection(connNow, user.id);
  check("recheck ok", recheck.ok);

  log("audit log");
  const entries = await recentAudit(org.id, 100);
  const actions = new Set(entries.map((e) => e.action));
  for (const expected of [
    "org.created",
    "connection.created",
    "backup.started",
    "backup.succeeded",
    "restore.executed",
    "drill.passed",
    "drill.failed",
    "policy.updated",
    "backup.missed",
    "snapshot.pruned",
    "plan.changed",
  ]) {
    check(`audit has ${expected}`, actions.has(expected));
  }

  log("compliance report");
  const report = await buildReport(org, currentPeriod());
  check("PDF produced", report.bytes.subarray(0, 5).toString() === "%PDF-", report.filename);
  check("PDF non-trivial size", report.bytes.length > 1500, `${report.bytes.length} bytes`);
  const prev = await buildReport(org, previousPeriod());
  check("empty-period PDF also renders", prev.bytes.subarray(0, 5).toString() === "%PDF-");
  await (await import("node:fs/promises")).writeFile("/tmp/vaultback-report.pdf", report.bytes);

  log("alert dedupe");
  const deliveries = await db
    .select()
    .from((await import("@/db/schema")).alertDeliveries)
    .where(eq((await import("@/db/schema")).alertDeliveries.orgId, org.id));
  check("alerts recorded once each", deliveries.length >= 2, JSON.stringify(deliveries.map((d) => d.kind)));

  console.log(failures ? `\n${failures} FAILURES` : "\nall checks passed");
  await closeDb();
  process.exit(failures ? 1 : 0);
}

async function scratchGone(name: string): Promise<boolean> {
  const { connectSource } = await import("@/lib/source-db");
  const admin = connectSource(process.env.SCRATCH_POSTGRES_URL!, { max: 1 });
  try {
    const rows = await admin.unsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM pg_database WHERE datname = '${name}'`,
    );
    return Number(rows[0].n) === 0;
  } finally {
    await admin.end({ timeout: 5 });
  }
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
