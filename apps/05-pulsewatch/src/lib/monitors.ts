/**
 * Monitor domain logic: create/edit/pause/delete with plan limits enforced at
 * the boundary, plus the queries the dashboard and status pages read.
 *
 * Plan enforcement lives here rather than in the route handlers so the
 * scheduler and the UI can never disagree about what a team is allowed.
 */

import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  checkResults,
  domainExpiry,
  incidents,
  monitors,
  sslCertificates,
  type Monitor,
  type MonitorType,
  type PlanId,
  type ScheduleKind,
} from "@/db/schema";
import { allowedInterval, allowedRegions, plan } from "@/lib/plans";
import { env } from "@/lib/env";

export class PlanLimitError extends Error {}
export class ValidationError extends Error {}

export interface CreateMonitorInput {
  teamId: string;
  planId: PlanId;
  name: string;
  type: MonitorType;
  target: string;
  intervalSeconds?: number;
  regions?: string[];
  // http
  expectedStatusCodes?: number[];
  keyword?: string | null;
  keywordInvert?: boolean;
  followRedirects?: boolean;
  requestHeaders?: Record<string, string> | null;
  timeoutMs?: number;
  failureThreshold?: number;
  // heartbeat
  scheduleKind?: ScheduleKind;
  expectedIntervalSeconds?: number | null;
  cronExpression?: string | null;
  graceSeconds?: number;
}

/** Heartbeat ping tokens are URL-safe and long enough to be unguessable. */
export function newPingToken(): string {
  return randomBytes(16).toString("base64url");
}

export function pingUrl(token: string): string {
  return `${env.pingBaseUrl}/api/ping/${token}`;
}

/** Normalise and sanity-check a target for its monitor type. */
export function normalizeTarget(type: MonitorType, raw: string): string {
  const value = raw.trim();
  if (!value) throw new ValidationError("Enter something to watch");

  if (type === "http") {
    const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      throw new ValidationError("That doesn't look like a URL");
    }
    // A single-label host is legitimate: localhost, a Docker service name, an
    // internal hostname behind a VPN. Only an empty host is actually wrong.
    if (!url.hostname) throw new ValidationError("That doesn't look like a URL");
    return url.toString();
  }

  if (type === "ssl" || type === "domain") {
    // Accept a pasted URL and reduce it to a hostname.
    const host = value.replace(/^https?:\/\//i, "").split("/")[0].split(":")[0].toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
      throw new ValidationError("Enter a hostname like shopfront.dev");
    }
    return host;
  }

  // Heartbeats have no outbound target; the name carries the meaning.
  return "";
}

export async function countMonitors(teamId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(monitors)
    .where(eq(monitors.teamId, teamId));
  return row?.n ?? 0;
}

export async function createMonitor(input: CreateMonitorInput): Promise<Monitor> {
  const db = getDb();
  const limits = plan(input.planId);

  const used = await countMonitors(input.teamId);
  if (used >= limits.monitors) {
    throw new PlanLimitError(
      `The ${limits.name} plan covers ${limits.monitors} monitors. Upgrade to add more.`,
    );
  }

  const name = input.name.trim();
  if (!name) throw new ValidationError("Give the monitor a name");

  const target = normalizeTarget(input.type, input.type === "heartbeat" ? "-" : input.target);

  const isHeartbeat = input.type === "heartbeat";
  // Expiry watchers are scanned daily; heartbeats are swept, not polled.
  const baseInterval =
    input.type === "ssl" || input.type === "domain"
      ? 86_400
      : allowedInterval(input.planId, input.intervalSeconds ?? limits.minIntervalSeconds);

  if (isHeartbeat) {
    if (input.scheduleKind === "cron") {
      if (!input.cronExpression?.trim()) throw new ValidationError("Enter a cron expression");
      assertCron(input.cronExpression);
    } else if (!input.expectedIntervalSeconds || input.expectedIntervalSeconds < 60) {
      throw new ValidationError("Expected interval must be at least 60 seconds");
    }
  }

  const [row] = await db
    .insert(monitors)
    .values({
      teamId: input.teamId,
      name,
      type: input.type,
      target,
      intervalSeconds: baseInterval,
      // A heartbeat is never dispatched to a probe, so it is never "due".
      nextDueAt: isHeartbeat ? farFuture() : new Date(),
      regions: allowedRegions(input.planId, input.regions ?? [], env.probeRegions),
      expectedStatusCodes: input.expectedStatusCodes?.length
        ? input.expectedStatusCodes
        : [200],
      keyword: input.keyword?.trim() || null,
      keywordInvert: input.keywordInvert ?? false,
      followRedirects: input.followRedirects ?? true,
      requestHeaders: input.requestHeaders ?? null,
      timeoutMs: Math.min(Math.max(input.timeoutMs ?? 10_000, 1_000), 30_000),
      failureThreshold: Math.min(Math.max(input.failureThreshold ?? 2, 1), 5),
      pingToken: isHeartbeat ? newPingToken() : null,
      scheduleKind: input.scheduleKind ?? "interval",
      expectedIntervalSeconds: isHeartbeat ? (input.expectedIntervalSeconds ?? 3_600) : null,
      cronExpression: isHeartbeat ? (input.cronExpression?.trim() || null) : null,
      graceSeconds: Math.max(input.graceSeconds ?? 300, 30),
      status: "pending",
    })
    .returning();
  return row;
}

function farFuture(): Date {
  return new Date(8_640_000_000_000); // ~year 2243; "never due"
}

/** Cheap 5-field cron validation — enough to reject typos at the boundary. */
export function assertCron(expression: string): void {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new ValidationError("Cron needs 5 fields, e.g. 0 3 * * *");
  }
  const bounds: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  fields.forEach((field, i) => {
    const [min, max] = bounds[i];
    for (const part of field.split(",")) {
      const [range, step] = part.split("/");
      if (step !== undefined && !/^\d+$/.test(step)) {
        throw new ValidationError(`Bad step in "${part}"`);
      }
      if (range === "*") continue;
      for (const bit of range.split("-")) {
        if (!/^\d+$/.test(bit) || Number(bit) < min || Number(bit) > max) {
          throw new ValidationError(`"${part}" is out of range for that field`);
        }
      }
    }
  });
}

export async function pauseMonitor(id: string, teamId: string, paused: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(monitors)
    .set(
      paused
        ? { status: "paused", pausedAt: new Date() }
        : {
            status: "pending",
            pausedAt: null,
            nextDueAt: new Date(),
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
          },
    )
    .where(and(eq(monitors.id, id), eq(monitors.teamId, teamId)));
}

export async function deleteMonitor(id: string, teamId: string): Promise<void> {
  const db = getDb();
  await db.delete(monitors).where(and(eq(monitors.id, id), eq(monitors.teamId, teamId)));
}

/** Force a re-check now (pull-to-refresh, and the header refresh control). */
export async function recheckNow(id: string, teamId: string): Promise<void> {
  const db = getDb();
  await db
    .update(monitors)
    .set({ nextDueAt: new Date() })
    .where(and(eq(monitors.id, id), eq(monitors.teamId, teamId), eq(monitors.status, "paused")));
  await db
    .update(monitors)
    .set({ nextDueAt: new Date() })
    .where(and(eq(monitors.id, id), eq(monitors.teamId, teamId)));
}

export async function listMonitors(teamId: string): Promise<Monitor[]> {
  const db = getDb();
  return db
    .select()
    .from(monitors)
    .where(eq(monitors.teamId, teamId))
    .orderBy(monitors.type, monitors.name);
}

export async function getMonitor(id: string, teamId: string): Promise<Monitor | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.id, id), eq(monitors.teamId, teamId)));
  return row ?? null;
}

/**
 * Recent latency points for a monitor's sparkline. Ascending by time so the
 * canvas can draw straight through the array.
 */
export async function recentLatencies(monitorId: string, limit = 60): Promise<number[]> {
  const db = getDb();
  const rows = await db
    .select({ latencyMs: checkResults.latencyMs, ok: checkResults.ok })
    .from(checkResults)
    .where(eq(checkResults.monitorId, monitorId))
    .orderBy(desc(checkResults.checkedAt))
    .limit(limit);
  // A failed check is a zero, so the trace visibly drops to baseline.
  return rows.reverse().map((r) => (r.ok ? (r.latencyMs ?? 0) : 0));
}

/** p50/p99 over the last 24h, for the monitor row's mono pair. */
export async function latencyPercentiles(
  monitorId: string,
): Promise<{ p50: number | null; p99: number | null }> {
  const db = getDb();
  const since = new Date(Date.now() - 86_400_000);
  const [row] = await db
    .select({
      p50: sql<number | null>`percentile_disc(0.5) within group (order by ${checkResults.latencyMs})`,
      p99: sql<number | null>`percentile_disc(0.99) within group (order by ${checkResults.latencyMs})`,
    })
    .from(checkResults)
    .where(
      and(
        eq(checkResults.monitorId, monitorId),
        eq(checkResults.ok, true),
        gte(checkResults.checkedAt, since),
      ),
    );
  return { p50: row?.p50 ?? null, p99: row?.p99 ?? null };
}

/**
 * Everything the monitor wall needs, in three queries instead of three per row.
 * A dashboard with 100 monitors must not become 300 round-trips.
 */
export async function wallData(list: Monitor[]): Promise<
  Map<string, { points: number[]; p50: number | null; p99: number | null; expiresAt: Date | null }>
> {
  const out = new Map<
    string,
    { points: number[]; p50: number | null; p99: number | null; expiresAt: Date | null }
  >();
  for (const m of list) out.set(m.id, { points: [], p50: null, p99: null, expiresAt: null });
  if (!list.length) return out;

  const db = getDb();
  const httpIds = list.filter((m) => m.type === "http").map((m) => m.id);

  // Recent points for the sparklines: one pass, grouped in memory.
  if (httpIds.length) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const rows = await db
      .select({
        monitorId: checkResults.monitorId,
        latencyMs: checkResults.latencyMs,
        ok: checkResults.ok,
      })
      .from(checkResults)
      .where(and(inArray(checkResults.monitorId, httpIds), gte(checkResults.checkedAt, since)))
      .orderBy(checkResults.checkedAt);
    for (const row of rows) {
      const entry = out.get(row.monitorId);
      if (!entry) continue;
      entry.points.push(row.ok ? (row.latencyMs ?? 0) : 0);
      if (entry.points.length > 60) entry.points.shift();
    }

    const day = new Date(Date.now() - 86_400_000);
    const percentiles = await db
      .select({
        monitorId: checkResults.monitorId,
        p50: sql<number | null>`percentile_disc(0.5) within group (order by ${checkResults.latencyMs})`,
        p99: sql<number | null>`percentile_disc(0.99) within group (order by ${checkResults.latencyMs})`,
      })
      .from(checkResults)
      .where(
        and(
          inArray(checkResults.monitorId, httpIds),
          eq(checkResults.ok, true),
          gte(checkResults.checkedAt, day),
        ),
      )
      .groupBy(checkResults.monitorId);
    for (const row of percentiles) {
      const entry = out.get(row.monitorId);
      if (entry) {
        entry.p50 = row.p50;
        entry.p99 = row.p99;
      }
    }
  }

  // Expiry dates for the ssl/domain rows.
  const expiryIds = list.filter((m) => m.type === "ssl" || m.type === "domain").map((m) => m.id);
  if (expiryIds.length) {
    const certs = await db
      .select({ monitorId: sslCertificates.monitorId, notAfter: sslCertificates.notAfter })
      .from(sslCertificates)
      .where(inArray(sslCertificates.monitorId, expiryIds));
    for (const row of certs) {
      const entry = out.get(row.monitorId);
      if (entry) entry.expiresAt = row.notAfter;
    }
    const domains = await db
      .select({ monitorId: domainExpiry.monitorId, expiresAt: domainExpiry.expiresAt })
      .from(domainExpiry)
      .where(inArray(domainExpiry.monitorId, expiryIds));
    for (const row of domains) {
      const entry = out.get(row.monitorId);
      if (entry) entry.expiresAt = row.expiresAt;
    }
  }

  return out;
}

/** Open incidents for a set of monitors, newest first. */
export async function openIncidentsFor(monitorIds: string[]) {
  if (!monitorIds.length) return [];
  const db = getDb();
  return db
    .select()
    .from(incidents)
    .where(and(inArray(incidents.monitorId, monitorIds), isNull(incidents.resolvedAt)))
    .orderBy(desc(incidents.startedAt));
}
