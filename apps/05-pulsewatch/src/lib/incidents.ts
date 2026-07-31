/**
 * The incident engine: turn check results into monitor state, incidents, and
 * alert jobs.
 *
 * The one rule that matters (README's existential risk): never page someone for
 * a blip. A monitor only flips to `down` once the failure is confirmed —
 * `failureThreshold` consecutive failures on a single-region plan, or that many
 * distinct regions failing concurrently when the plan fans out. Recovery is
 * deliberately faster than failure: one good check reopens the trace.
 */

import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkResults,
  domainExpiry,
  incidents,
  incidentUpdates,
  monitors,
  sslCertificates,
  uptimeDaily,
  type Incident,
  type IncidentKind,
  type Monitor,
} from "@/db/schema";
import { alertsQueue, type CheckResultJob } from "@/lib/queue";
import { hasQueue } from "@/lib/runtime";
import { duration } from "@/lib/format";

/** Thresholds (days) at which an expiry warning fires, each exactly once. */
export const EXPIRY_THRESHOLDS = [30, 14, 7, 1] as const;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Persist one probe result and advance the monitor's state machine.
 * Returns the incident that opened or resolved, if any.
 */
export async function recordResult(result: CheckResultJob): Promise<Incident | null> {
  const db = getDb();
  const [monitor] = await db.select().from(monitors).where(eq(monitors.id, result.monitorId));
  if (!monitor) return null;
  // A paused monitor's in-flight results are recorded but never alert.
  const checkedAt = new Date();

  await db.insert(checkResults).values({
    monitorId: monitor.id,
    region: result.region,
    checkedAt,
    ok: result.ok,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    errorKind: result.errorKind,
    errorDetail: result.errorDetail?.slice(0, 500) ?? null,
  });

  await bumpRollup(monitor.id, checkedAt, result.ok, result.latencyMs);

  const failures = result.ok ? 0 : monitor.consecutiveFailures + 1;
  const successes = result.ok ? monitor.consecutiveSuccesses + 1 : 0;

  await db
    .update(monitors)
    .set({
      lastCheckedAt: checkedAt,
      lastLatencyMs: result.ok ? result.latencyMs : monitor.lastLatencyMs,
      consecutiveFailures: failures,
      consecutiveSuccesses: successes,
      nextDueAt: new Date(checkedAt.getTime() + monitor.intervalSeconds * 1000),
    })
    .where(eq(monitors.id, monitor.id));

  if (monitor.status === "paused") return null;

  const confirmed = await isFailureConfirmed(
    { ...monitor, consecutiveFailures: failures },
    result.ok,
  );

  if (!result.ok && confirmed.down && monitor.status !== "down") {
    return openIncident({
      monitor,
      kind: "down",
      title: `${monitor.name} is down`,
      triggerSummary: describeFailure(result, confirmed.regions),
      confirmingRegions: confirmed.regions,
    });
  }

  if (result.ok && monitor.status === "down") {
    return resolveOpenIncident(monitor, "down");
  }

  // First successful check on a fresh monitor: leave "pending" behind quietly.
  if (result.ok && monitor.status !== "up") {
    await db.update(monitors).set({ status: "up" }).where(eq(monitors.id, monitor.id));
  }

  return null;
}

function describeFailure(result: CheckResultJob, regions: string[]): string {
  const what =
    result.errorKind === "status"
      ? `HTTP ${result.statusCode}`
      : result.errorKind === "timeout"
        ? "timed out"
        : result.errorKind === "keyword"
          ? "keyword missing"
          : (result.errorDetail ?? result.errorKind ?? "unreachable");
  const where = regions.length > 1 ? ` · ${regions.length} regions` : ` · ${result.region}`;
  return `${what}${where}`;
}

/**
 * The false-positive firewall. Single-region plans need N consecutive failures;
 * multi-region plans need N regions failing at the same time, which is both
 * faster and far harder to trigger by accident.
 */
async function isFailureConfirmed(
  monitor: Monitor,
  lastOk: boolean,
): Promise<{ down: boolean; regions: string[] }> {
  if (lastOk) return { down: false, regions: [] };

  if (monitor.regions.length <= 1) {
    return {
      down: monitor.consecutiveFailures >= monitor.failureThreshold,
      regions: monitor.regions,
    };
  }

  const db = getDb();
  // Most recent result per region, within a window that can't include stale data.
  const window = new Date(Date.now() - monitor.intervalSeconds * 2000 - 30_000);
  const rows = await db.execute<{ region: string; ok: boolean }>(sql`
    select distinct on (region) region, ok
    from ${checkResults}
    where ${checkResults.monitorId} = ${monitor.id}
      and ${checkResults.checkedAt} >= ${window}
    order by region, ${checkResults.checkedAt} desc
  `);
  const failing = [...rows].filter((r) => !r.ok).map((r) => r.region);
  const needed = Math.min(monitor.failureThreshold, monitor.regions.length);
  return { down: failing.length >= needed, regions: failing };
}

export interface OpenIncidentInput {
  monitor: Pick<Monitor, "id" | "teamId" | "name">;
  kind: IncidentKind;
  title: string;
  triggerSummary: string;
  confirmingRegions?: string[];
  /** Expiry alerts use "ssl:14"; down alerts use "down". */
  edge?: string;
  markMonitorDown?: boolean;
}

export async function openIncident(input: OpenIncidentInput): Promise<Incident> {
  const db = getDb();
  const [incident] = await db
    .insert(incidents)
    .values({
      monitorId: input.monitor.id,
      teamId: input.monitor.teamId,
      kind: input.kind,
      title: input.title,
      triggerSummary: input.triggerSummary,
      confirmingRegions: input.confirmingRegions ?? [],
    })
    .returning();

  // Expiry warnings are advisory: they alert, but the service is not down.
  const isOutage = input.kind === "down" || input.kind === "missed_heartbeat";
  if (input.markMonitorDown ?? isOutage) {
    await db.update(monitors).set({ status: "down" }).where(eq(monitors.id, input.monitor.id));
  }

  await db.insert(incidentUpdates).values({
    incidentId: incident.id,
    body: input.triggerSummary || input.title,
    visibility: "public",
  });

  await enqueueAlert(incident.id, input.edge ?? "down");
  return incident;
}

/** Resolve the newest open incident of a kind and fan out recovery alerts. */
export async function resolveOpenIncident(
  monitor: Pick<Monitor, "id">,
  kind: IncidentKind,
): Promise<Incident | null> {
  const db = getDb();
  const [open] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.monitorId, monitor.id),
        eq(incidents.kind, kind),
        isNull(incidents.resolvedAt),
      ),
    )
    .orderBy(desc(incidents.startedAt))
    .limit(1);

  const resolvedAt = new Date();
  await db.update(monitors).set({ status: "up" }).where(eq(monitors.id, monitor.id));
  if (!open) return null;

  const [resolved] = await db
    .update(incidents)
    .set({ resolvedAt })
    .where(eq(incidents.id, open.id))
    .returning();

  const downFor = (resolvedAt.getTime() - open.startedAt.getTime()) / 1000;
  await db.insert(incidentUpdates).values({
    incidentId: open.id,
    body: `Recovered after ${duration(downFor)}.`,
    visibility: "public",
  });
  await addDownSeconds(monitor.id, resolvedAt, downFor);

  await enqueueAlert(open.id, "recovery");
  return resolved;
}

export async function acknowledgeIncident(incidentId: string, teamId: string): Promise<void> {
  const db = getDb();
  await db
    .update(incidents)
    .set({ acknowledgedAt: new Date() })
    .where(and(eq(incidents.id, incidentId), eq(incidents.teamId, teamId)));
}

/** Manual incident posting for status pages (README MVP: "manual incident posting"). */
export async function createManualIncident(
  teamId: string,
  title: string,
  body: string,
  authorUserId: string,
): Promise<Incident> {
  const db = getDb();
  const [incident] = await db
    .insert(incidents)
    .values({ teamId, kind: "manual", title, triggerSummary: body })
    .returning();
  await db
    .insert(incidentUpdates)
    .values({ incidentId: incident.id, body, authorUserId, visibility: "public" });
  return incident;
}

export async function postIncidentUpdate(
  incidentId: string,
  teamId: string,
  body: string,
  authorUserId: string,
  visibility: "public" | "private" = "public",
): Promise<void> {
  const db = getDb();
  const [owned] = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(and(eq(incidents.id, incidentId), eq(incidents.teamId, teamId)));
  if (!owned) throw new Error("Incident not found");
  await db.insert(incidentUpdates).values({ incidentId, body, authorUserId, visibility });
}

export async function resolveManualIncident(incidentId: string, teamId: string): Promise<void> {
  const db = getDb();
  await db
    .update(incidents)
    .set({ resolvedAt: new Date() })
    .where(and(eq(incidents.id, incidentId), eq(incidents.teamId, teamId), isNull(incidents.resolvedAt)));
}

/* ------------------------------------------------------ expiry watchers --- */

/**
 * Record a TLS scan. Fires one advisory incident per crossed threshold, ever —
 * the uniqueness of `notifications.edge` is what makes "each threshold once"
 * true even if the scan runs twice in a day.
 */
export async function recordSslScan(
  monitor: Monitor,
  scan: { notAfter: Date | null; issuer: string | null; subject: string | null; error?: string },
): Promise<void> {
  const db = getDb();
  const daysRemaining = scan.notAfter
    ? Math.floor((scan.notAfter.getTime() - Date.now()) / 86_400_000)
    : null;

  await db
    .insert(sslCertificates)
    .values({
      monitorId: monitor.id,
      issuer: scan.issuer,
      subject: scan.subject,
      notAfter: scan.notAfter,
      daysRemaining,
      lastScannedAt: new Date(),
      lastError: scan.error ?? null,
    })
    .onConflictDoUpdate({
      target: sslCertificates.monitorId,
      set: {
        issuer: scan.issuer,
        subject: scan.subject,
        notAfter: scan.notAfter,
        daysRemaining,
        lastScannedAt: new Date(),
        lastError: scan.error ?? null,
      },
    });

  await db
    .update(monitors)
    .set({
      lastCheckedAt: new Date(),
      status: scan.error ? monitor.status : "up",
      nextDueAt: new Date(Date.now() + monitor.intervalSeconds * 1000),
    })
    .where(eq(monitors.id, monitor.id));

  if (daysRemaining != null) {
    await maybeWarnExpiry(monitor, "ssl_expiry", "ssl", daysRemaining, scan.notAfter);
  }
}

export async function recordDomainScan(
  monitor: Monitor,
  scan: { expiresAt: Date | null; registrar: string | null; error?: string },
): Promise<void> {
  const db = getDb();
  const daysRemaining = scan.expiresAt
    ? Math.floor((scan.expiresAt.getTime() - Date.now()) / 86_400_000)
    : null;

  await db
    .insert(domainExpiry)
    .values({
      monitorId: monitor.id,
      domain: monitor.target,
      registrar: scan.registrar,
      expiresAt: scan.expiresAt,
      daysRemaining,
      lastWhoisAt: new Date(),
      lastError: scan.error ?? null,
    })
    .onConflictDoUpdate({
      target: domainExpiry.monitorId,
      set: {
        registrar: scan.registrar,
        expiresAt: scan.expiresAt,
        daysRemaining,
        lastWhoisAt: new Date(),
        lastError: scan.error ?? null,
      },
    });

  await db
    .update(monitors)
    .set({
      lastCheckedAt: new Date(),
      status: scan.error ? monitor.status : "up",
      nextDueAt: new Date(Date.now() + monitor.intervalSeconds * 1000),
    })
    .where(eq(monitors.id, monitor.id));

  if (daysRemaining != null) {
    await maybeWarnExpiry(monitor, "domain_expiry", "domain", daysRemaining, scan.expiresAt);
  }
}

async function maybeWarnExpiry(
  monitor: Monitor,
  kind: IncidentKind,
  edgePrefix: "ssl" | "domain",
  daysRemaining: number,
  expiresAt: Date | null,
): Promise<void> {
  // The *tightest* threshold crossed, not the loosest: at 10 days remaining the
  // customer needs the "14 days" alert, having already had "30 days". Using
  // find() here would report 30 forever and go silent until expiry.
  const crossed = EXPIRY_THRESHOLDS.findLast((t) => daysRemaining <= t);
  if (crossed == null) return;

  const db = getDb();
  // One incident per (monitor, threshold): reuse the open one if it exists.
  const [existing] = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.monitorId, monitor.id),
        eq(incidents.kind, kind),
        isNull(incidents.resolvedAt),
      ),
    )
    .orderBy(desc(incidents.startedAt))
    .limit(1);

  const edge = `${edgePrefix}:${crossed}`;
  const noun = edgePrefix === "ssl" ? "TLS certificate" : "Domain registration";
  const summary = `${noun} for ${monitor.target} expires in ${daysRemaining}d${
    expiresAt ? ` (${expiresAt.toISOString().slice(0, 10)})` : ""
  }`;

  if (existing) {
    // Same incident, deeper threshold: alert again, once, on the new edge.
    await db.insert(incidentUpdates).values({
      incidentId: existing.id,
      body: summary,
      visibility: "public",
    });
    await enqueueAlert(existing.id, edge);
    return;
  }

  await openIncident({
    monitor,
    kind,
    title: `${monitor.name}: ${noun.toLowerCase()} expiring`,
    triggerSummary: summary,
    edge,
    markMonitorDown: false,
  });
}

/** Clear an expiry incident once the certificate or registration was renewed. */
export async function clearExpiryIncidentIfRenewed(
  monitor: Monitor,
  kind: IncidentKind,
  daysRemaining: number | null,
): Promise<void> {
  if (daysRemaining == null || daysRemaining <= EXPIRY_THRESHOLDS[0]) return;
  const db = getDb();
  await db
    .update(incidents)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(incidents.monitorId, monitor.id),
        eq(incidents.kind, kind),
        isNull(incidents.resolvedAt),
      ),
    );
}

/* ------------------------------------------------------------- internals --- */

async function enqueueAlert(incidentId: string, edge: string): Promise<void> {
  // Without Redis there is no dispatcher process to hand this to, so send it
  // here and now. Dedupe lives in the notifications unique index either way, so
  // the two paths cannot double-page even if both somehow ran.
  if (!hasQueue()) {
    try {
      const { dispatchAlert } = await import("@/lib/alerts");
      await dispatchAlert(incidentId, edge);
    } catch (err) {
      console.error(`[incidents] inline alert ${edge} for ${incidentId} failed`, err);
    }
    return;
  }

  try {
    await alertsQueue().add("dispatch", { incidentId, edge });
  } catch (err) {
    // Never let a queue hiccup lose the incident itself; the dispatcher also
    // sweeps for un-notified incidents as a backstop.
    console.error(`[incidents] failed to enqueue alert ${edge} for ${incidentId}`, err);
  }
}

async function bumpRollup(
  monitorId: string,
  at: Date,
  ok: boolean,
  latencyMs: number | null,
): Promise<void> {
  const db = getDb();
  const day = startOfUtcDay(at);
  await db
    .insert(uptimeDaily)
    .values({
      monitorId,
      day,
      okChecks: ok ? 1 : 0,
      totalChecks: 1,
      p50LatencyMs: latencyMs,
      p99LatencyMs: latencyMs,
    })
    .onConflictDoUpdate({
      target: [uptimeDaily.monitorId, uptimeDaily.day],
      set: {
        okChecks: sql`${uptimeDaily.okChecks} + ${ok ? 1 : 0}`,
        totalChecks: sql`${uptimeDaily.totalChecks} + 1`,
      },
    });
}

async function addDownSeconds(monitorId: string, at: Date, seconds: number): Promise<void> {
  const db = getDb();
  const day = startOfUtcDay(at);
  await db
    .insert(uptimeDaily)
    .values({ monitorId, day, downSeconds: Math.round(seconds) })
    .onConflictDoUpdate({
      target: [uptimeDaily.monitorId, uptimeDaily.day],
      set: { downSeconds: sql`${uptimeDaily.downSeconds} + ${Math.round(seconds)}` },
    });
}

/** Recent incidents for the dashboard, newest first. */
export async function recentIncidents(teamId: string, limit = 20): Promise<Incident[]> {
  const db = getDb();
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.teamId, teamId))
    .orderBy(desc(incidents.startedAt))
    .limit(limit);
}

export async function getIncident(id: string, teamId: string): Promise<Incident | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(incidents)
    .where(and(eq(incidents.id, id), eq(incidents.teamId, teamId)));
  return row ?? null;
}

export async function incidentTimeline(incidentId: string) {
  const db = getDb();
  return db
    .select()
    .from(incidentUpdates)
    .where(eq(incidentUpdates.incidentId, incidentId))
    .orderBy(incidentUpdates.postedAt);
}

/** Incidents in the last N days for a monitor — status-page history. */
export async function incidentsSince(monitorIds: string[], since: Date): Promise<Incident[]> {
  if (!monitorIds.length) return [];
  const db = getDb();
  return db
    .select()
    .from(incidents)
    .where(and(gte(incidents.startedAt, since), inArray(incidents.monitorId, monitorIds)))
    .orderBy(desc(incidents.startedAt));
}
