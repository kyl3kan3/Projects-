/**
 * Compliance report v1 — the monthly PDF that turns a cron job into a business
 * document (README differentiation 3).
 *
 * It answers the four questions a security questionnaire actually asks: are you
 * backing up, how often did it work, do you test restores, and is it encrypted.
 * Every number in it is read from the operational tables, so it cannot flatter:
 * a month with three failures says three failures.
 */

import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import { getDb } from "@/db";
import {
  backupJobs,
  backupPolicies,
  databaseConnections,
  restoreDrills,
  restoreRuns,
  snapshots,
  storageTargets,
  type Organization,
} from "@/db/schema";
import { plan } from "@/lib/plans";
import { PAGE, PdfDocument } from "@/lib/pdf";
import { formatBytes, formatCount, formatDuration } from "@/lib/format";

export interface ReportPeriod {
  /** First instant of the month, UTC. */
  from: Date;
  /** First instant of the following month. */
  to: Date;
  label: string;
}

export function monthPeriod(year: number, month: number): ReportPeriod {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
  return {
    from,
    to,
    label: from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export function currentPeriod(now = new Date()): ReportPeriod {
  return monthPeriod(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

export function previousPeriod(now = new Date()): ReportPeriod {
  const month = now.getUTCMonth(); // 0-based: this is last month in 1-based terms
  return month === 0
    ? monthPeriod(now.getUTCFullYear() - 1, 12)
    : monthPeriod(now.getUTCFullYear(), month);
}

export interface DatabaseReport {
  name: string;
  provider: string;
  frequency: string;
  retentionDays: number;
  attempts: number;
  succeeded: number;
  failed: number;
  successRate: number;
  snapshotsTaken: number;
  bytesStored: number;
  drillsRun: number;
  drillsPassed: number;
  lastDrillAt: Date | null;
  longestGapHours: number | null;
}

export interface ReportData {
  org: Organization;
  period: ReportPeriod;
  generatedAt: Date;
  databases: DatabaseReport[];
  totals: {
    attempts: number;
    succeeded: number;
    failed: number;
    successRate: number;
    snapshots: number;
    bytesStored: number;
    drillsRun: number;
    drillsPassed: number;
    restores: number;
  };
  storage: { name: string; kind: string; location: string; verifiedAt: Date | null }[];
  encryption: string;
}

export async function gatherReport(org: Organization, period: ReportPeriod): Promise<ReportData> {
  const db = getDb();

  const connections = await db
    .select()
    .from(databaseConnections)
    .where(eq(databaseConnections.orgId, org.id));

  const databases: DatabaseReport[] = [];
  for (const connection of connections) {
    const [policy] = await db
      .select()
      .from(backupPolicies)
      .where(eq(backupPolicies.databaseConnectionId, connection.id));

    const jobs = await db
      .select()
      .from(backupJobs)
      .where(
        and(
          eq(backupJobs.databaseConnectionId, connection.id),
          gte(backupJobs.createdAt, period.from),
          lt(backupJobs.createdAt, period.to),
        ),
      );

    const snaps = await db
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.databaseConnectionId, connection.id),
          gte(snapshots.createdAt, period.from),
          lt(snapshots.createdAt, period.to),
        ),
      );

    const drills = await db
      .select()
      .from(restoreDrills)
      .where(
        and(
          eq(restoreDrills.databaseConnectionId, connection.id),
          gte(restoreDrills.createdAt, period.from),
          lt(restoreDrills.createdAt, period.to),
        ),
      );

    const succeeded = jobs.filter((j) => j.status === "succeeded").length;
    const failed = jobs.filter((j) => j.status === "failed").length;

    // The longest gap between successful snapshots is the number that actually
    // answers "how much data could we have lost?".
    const times = snaps.map((s) => s.createdAt.getTime()).sort((a, b) => a - b);
    let longestGapHours: number | null = null;
    if (times.length >= 2) {
      let gap = 0;
      for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
      longestGapHours = Math.round((gap / 3_600_000) * 10) / 10;
    }

    databases.push({
      name: connection.name,
      provider: connection.provider,
      frequency: policy?.frequency ?? "none",
      retentionDays: policy?.retentionDays ?? 0,
      attempts: jobs.length,
      succeeded,
      failed,
      successRate: jobs.length ? Math.round((succeeded / jobs.length) * 1000) / 10 : 0,
      snapshotsTaken: snaps.length,
      bytesStored: snaps.reduce((sum, s) => sum + (s.compressedSizeBytes ?? 0), 0),
      drillsRun: drills.length,
      drillsPassed: drills.filter((d) => d.status === "passed").length,
      lastDrillAt: drills.length ? drills[drills.length - 1].createdAt : (policy?.lastDrillAt ?? null),
      longestGapHours,
    });
  }

  const restores = await db
    .select()
    .from(restoreRuns)
    .where(
      and(
        eq(restoreRuns.orgId, org.id),
        gte(restoreRuns.createdAt, period.from),
        lt(restoreRuns.createdAt, period.to),
      ),
    );

  const targets = await db
    .select()
    .from(storageTargets)
    .where(eq(storageTargets.orgId, org.id));

  const attempts = databases.reduce((s, d) => s + d.attempts, 0);
  const succeeded = databases.reduce((s, d) => s + d.succeeded, 0);

  return {
    org,
    period,
    generatedAt: new Date(),
    databases,
    totals: {
      attempts,
      succeeded,
      failed: databases.reduce((s, d) => s + d.failed, 0),
      successRate: attempts ? Math.round((succeeded / attempts) * 1000) / 10 : 0,
      snapshots: databases.reduce((s, d) => s + d.snapshotsTaken, 0),
      bytesStored: databases.reduce((s, d) => s + d.bytesStored, 0),
      drillsRun: databases.reduce((s, d) => s + d.drillsRun, 0),
      drillsPassed: databases.reduce((s, d) => s + d.drillsPassed, 0),
      restores: restores.length,
    },
    storage: targets.map((t) => ({
      name: t.name,
      kind: t.kind,
      location: t.kind === "managed" ? "VaultBack-managed bucket" : `${t.bucket}${t.prefix ? `/${t.prefix}` : ""}`,
      verifiedAt: t.verifiedAt,
    })),
    encryption:
      "AES-256-GCM per snapshot, with a unique data key wrapped by an organization-independent master key (envelope encryption). Data keys are never persisted in plaintext.",
  };
}

const COL = {
  left: PAGE.margin,
  mid: PAGE.margin + 210,
  right: PAGE.width - PAGE.margin,
};

export function renderReport(data: ReportData): Buffer {
  const doc = new PdfDocument(`VaultBack compliance report — ${data.period.label}`);

  doc.text("VAULTBACK", { size: 9, font: "bold", gray: 0.45 });
  doc.text("Backup and restore-verification report", { size: 19, font: "bold" });
  doc.text(`${data.org.name} · ${data.period.label}`, { size: 11, gray: 0.35 });
  doc.text(`Generated ${data.generatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`, {
    size: 9,
    font: "mono",
    gray: 0.45,
  });
  doc.hairline();
  doc.space(6);

  /* summary ------------------------------------------------------------- */
  doc.text("Summary", { size: 13, font: "bold" });
  doc.space(2);
  const t = data.totals;
  const summaryRows: [string, string][] = [
    ["Databases under management", formatCount(data.databases.length)],
    ["Backup attempts", formatCount(t.attempts)],
    ["Successful backups", formatCount(t.succeeded)],
    ["Failed backups", formatCount(t.failed)],
    ["Backup success rate", `${t.successRate}%`],
    ["Snapshots retained from this period", formatCount(t.snapshots)],
    ["Encrypted bytes stored", formatBytes(t.bytesStored)],
    ["Restore drills run", formatCount(t.drillsRun)],
    ["Restore drills passed", formatCount(t.drillsPassed)],
    ["Customer-initiated restores", formatCount(t.restores)],
    ["Plan", plan(data.org.plan).name],
  ];
  for (const [label, value] of summaryRows) {
    doc.row([
      { text: label, x: COL.left, size: 10 },
      { text: value, x: COL.right, size: 10, font: "mono", align: "right" },
    ]);
  }
  doc.space(10);

  /* per database -------------------------------------------------------- */
  doc.text("Per database", { size: 13, font: "bold" });
  doc.space(2);
  doc.row([
    { text: "DATABASE", x: COL.left, size: 8, font: "bold", gray: 0.45 },
    { text: "SCHEDULE", x: COL.left + 150, size: 8, font: "bold", gray: 0.45 },
    { text: "OK/RUN", x: COL.left + 260, size: 8, font: "bold", gray: 0.45 },
    { text: "DRILLS", x: COL.left + 330, size: 8, font: "bold", gray: 0.45 },
    { text: "STORED", x: COL.right, size: 8, font: "bold", gray: 0.45, align: "right" },
  ]);
  doc.hairline(0.85);

  if (!data.databases.length) {
    doc.paragraph("No databases were connected during this period.", { gray: 0.4 });
  }

  for (const d of data.databases) {
    doc.row([
      { text: d.name, x: COL.left, size: 9.5 },
      {
        text: `${d.frequency} · ${d.retentionDays}d`,
        x: COL.left + 150,
        size: 9,
        font: "mono",
        gray: 0.3,
      },
      {
        text: `${d.succeeded}/${d.attempts}`,
        x: COL.left + 260,
        size: 9,
        font: "mono",
        gray: d.failed ? 0.05 : 0.3,
      },
      {
        text: d.drillsRun ? `${d.drillsPassed}/${d.drillsRun} passed` : "none",
        x: COL.left + 330,
        size: 9,
        font: "mono",
        gray: 0.3,
      },
      { text: formatBytes(d.bytesStored), x: COL.right, size: 9, font: "mono", align: "right" },
    ]);
    if (d.longestGapHours != null) {
      doc.row([
        {
          text: `longest gap between snapshots: ${d.longestGapHours}h · provider: ${d.provider}`,
          x: COL.left + 8,
          size: 8,
          gray: 0.5,
        },
      ]);
    }
  }
  doc.space(10);

  /* encryption + storage ------------------------------------------------ */
  doc.text("Encryption posture", { size: 13, font: "bold" });
  doc.space(2);
  doc.paragraph(data.encryption, { size: 9.5, gray: 0.25 });
  doc.space(8);

  doc.text("Storage targets", { size: 13, font: "bold" });
  doc.space(2);
  for (const s of data.storage) {
    doc.row([
      { text: s.name, x: COL.left, size: 9.5 },
      { text: s.location, x: COL.mid, size: 9, font: "mono", gray: 0.35 },
      {
        text: s.verifiedAt ? `verified ${s.verifiedAt.toISOString().slice(0, 10)}` : "not verified",
        x: COL.right,
        size: 9,
        font: "mono",
        gray: 0.35,
        align: "right",
      },
    ]);
  }
  doc.space(12);

  doc.hairline();
  doc.paragraph(
    "This report is generated from VaultBack's operational records for the period stated. " +
      "Backup counts are attempts and outcomes as recorded at run time; drill results are the " +
      "outcome of restoring a snapshot into an ephemeral database and comparing every table's row " +
      "count against the manifest captured when the snapshot was taken.",
    { size: 8.5, gray: 0.45 },
  );

  return doc.build();
}

/** Convenience used by the download route. */
export async function buildReport(
  org: Organization,
  period: ReportPeriod,
): Promise<{ bytes: Buffer; filename: string }> {
  const data = await gatherReport(org, period);
  const bytes = renderReport(data);
  const stamp = `${period.from.getUTCFullYear()}-${String(period.from.getUTCMonth() + 1).padStart(2, "0")}`;
  return { bytes, filename: `vaultback-${org.slug}-${stamp}.pdf` };
}

/** Months that have any activity, for the report picker. */
export async function reportablePeriods(orgId: string, limit = 6): Promise<ReportPeriod[]> {
  const db = getDb();
  const [earliest] = await db
    .select({ createdAt: backupJobs.createdAt })
    .from(backupJobs)
    .where(and(eq(backupJobs.orgId, orgId), isNotNull(backupJobs.createdAt)))
    .orderBy(backupJobs.createdAt)
    .limit(1);

  const periods: ReportPeriod[] = [];
  const now = new Date();
  let cursor = currentPeriod(now);
  for (let i = 0; i < limit; i++) {
    periods.push(cursor);
    if (earliest && cursor.from <= earliest.createdAt) break;
    const prev = new Date(cursor.from.getTime());
    prev.setUTCDate(0); // last day of the previous month
    cursor = monthPeriod(prev.getUTCFullYear(), prev.getUTCMonth() + 1);
  }
  return periods;
}

export { formatDuration };
