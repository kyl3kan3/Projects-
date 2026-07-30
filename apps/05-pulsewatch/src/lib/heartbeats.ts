/**
 * Cron heartbeats — the wedge feature. A silently dead cron is more dangerous
 * than a down site, because nothing looks broken until data is lost.
 *
 * Ingest is a write-only hot path: token lookup, insert a ping, stamp
 * `last_ping_at`. The sweep is the other half — it decides when a job that
 * should have pinged has not.
 *
 * Cron matching is implemented here rather than pulled in as a dependency: the
 * question is only ever "when was this expression last due?", which is a
 * backwards minute walk over five fields.
 */

import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { heartbeatPings, incidents, monitors, type Monitor } from "@/db/schema";
import { openIncident, resolveOpenIncident } from "@/lib/incidents";
import { ago } from "@/lib/format";

/* ------------------------------------------------------------ cron fields --- */

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  /** Whether each of the day fields was restricted, for the Vixie-cron OR rule. */
  domRestricted: boolean;
  dowRestricted: boolean;
}

function expandField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isFinite(step) || step < 1) throw new Error(`Bad cron step in "${part}"`);

    let lo = min;
    let hi = max;
    if (rangePart !== "*") {
      const bits = rangePart.split("-");
      lo = Number(bits[0]);
      hi = bits.length > 1 ? Number(bits[1]) : lo;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error(`Bad cron field "${part}"`);
      // A bare "5/15" means "from 5 to the end of the range, every 15".
      if (bits.length === 1 && stepPart) hi = max;
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expression: string): CronFields {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("Cron needs 5 fields, e.g. 0 3 * * *");
  const dowRaw = expandField(fields[4], 0, 7);
  // Cron accepts both 0 and 7 for Sunday; JS getUTCDay only produces 0.
  if (dowRaw.has(7)) dowRaw.add(0);
  return {
    minute: expandField(fields[0], 0, 59),
    hour: expandField(fields[1], 0, 23),
    dayOfMonth: expandField(fields[2], 1, 31),
    month: expandField(fields[3], 1, 12),
    dayOfWeek: dowRaw,
    domRestricted: fields[2] !== "*",
    dowRestricted: fields[4] !== "*",
  };
}

function matches(fields: CronFields, d: Date): boolean {
  if (!fields.minute.has(d.getUTCMinutes())) return false;
  if (!fields.hour.has(d.getUTCHours())) return false;
  if (!fields.month.has(d.getUTCMonth() + 1)) return false;

  const domOk = fields.dayOfMonth.has(d.getUTCDate());
  const dowOk = fields.dayOfWeek.has(d.getUTCDay());
  // Vixie cron: when both day fields are restricted they OR, not AND.
  if (fields.domRestricted && fields.dowRestricted) return domOk || dowOk;
  if (fields.domRestricted) return domOk;
  if (fields.dowRestricted) return dowOk;
  return true;
}

/**
 * The most recent minute at or before `now` that the expression was due.
 * Returns null if nothing matched inside the lookback window.
 */
export function previousCronOccurrence(
  expression: string,
  now: Date,
  maxLookbackMinutes = 60 * 24 * 40,
): Date | null {
  const fields = parseCron(expression);
  const cursor = new Date(now.getTime());
  cursor.setUTCSeconds(0, 0);
  for (let i = 0; i <= maxLookbackMinutes; i++) {
    if (matches(fields, cursor)) return new Date(cursor.getTime());
    cursor.setUTCMinutes(cursor.getUTCMinutes() - 1);
  }
  return null;
}

/* ---------------------------------------------------------------- ingest --- */

export interface PingInput {
  token: string;
  sourceIp: string | null;
  userAgent: string | null;
  /** The /fail variant lets a job report its own non-zero exit. */
  failed: boolean;
  exitStatus: number | null;
  bodyExcerpt: string | null;
}

export type PingOutcome = "recorded" | "recorded_failure" | "unknown_token" | "rate_limited";

/**
 * In-process rate limit on the ingest path. Deliberately simple: one bucket per
 * token, no Redis round-trip on the hottest route in the product. It bounds
 * accidental ping storms, which is what it is for; distributed abuse control is
 * a Phase 2 concern (README's free-tier abuse risk).
 */
const INGEST_WINDOW_MS = 60_000;
const INGEST_MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(token: string, now: number): boolean {
  const bucket = buckets.get(token);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(token, { count: 1, resetAt: now + INGEST_WINDOW_MS });
    // Opportunistic sweep so the map cannot grow without bound.
    if (buckets.size > 5_000) {
      for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
    }
    return false;
  }
  bucket.count += 1;
  return bucket.count > INGEST_MAX_PER_WINDOW;
}

export async function recordPing(input: PingInput): Promise<PingOutcome> {
  const now = Date.now();
  if (rateLimited(input.token, now)) return "rate_limited";

  const db = getDb();
  const [monitor] = await db
    .select()
    .from(monitors)
    .where(and(eq(monitors.pingToken, input.token), eq(monitors.type, "heartbeat")));
  if (!monitor) return "unknown_token";

  const receivedAt = new Date(now);
  await db.insert(heartbeatPings).values({
    monitorId: monitor.id,
    receivedAt,
    sourceIp: input.sourceIp,
    userAgent: input.userAgent?.slice(0, 200) ?? null,
    exitStatus: input.exitStatus,
    bodyExcerpt: input.bodyExcerpt?.slice(0, 500) ?? null,
  });

  await db
    .update(monitors)
    .set({ lastPingAt: receivedAt, lastCheckedAt: receivedAt })
    .where(eq(monitors.id, monitor.id));

  if (monitor.status === "paused") return input.failed ? "recorded_failure" : "recorded";

  if (input.failed) {
    // The job ran and told us it failed — that is an outage, not a missed ping.
    if (monitor.status !== "down") {
      await openIncident({
        monitor,
        kind: "missed_heartbeat",
        title: `${monitor.name} reported a failure`,
        triggerSummary: `Job reported exit status ${input.exitStatus ?? "non-zero"}`,
      });
    }
    return "recorded_failure";
  }

  // A successful ping resolves whatever was open, missed or self-reported.
  if (monitor.status === "down") {
    await resolveOpenIncident(monitor, "missed_heartbeat");
  } else if (monitor.status !== "up") {
    await db.update(monitors).set({ status: "up" }).where(eq(monitors.id, monitor.id));
  }
  return "recorded";
}

/* ----------------------------------------------------------------- sweep --- */

/** When was this heartbeat supposed to have pinged by? */
export function dueBy(monitor: Monitor, now: Date): Date | null {
  const baseline = monitor.lastPingAt ?? monitor.createdAt;

  if (monitor.scheduleKind === "cron" && monitor.cronExpression) {
    let occurrence: Date | null;
    try {
      occurrence = previousCronOccurrence(monitor.cronExpression, now);
    } catch {
      return null; // Unparseable expression: never page on our own bad input.
    }
    // Only late if the last expected run is newer than the last ping we saw.
    if (!occurrence || occurrence <= baseline) return null;
    return new Date(occurrence.getTime() + monitor.graceSeconds * 1000);
  }

  const expected = monitor.expectedIntervalSeconds;
  if (!expected) return null;
  return new Date(baseline.getTime() + (expected + monitor.graceSeconds) * 1000);
}

/**
 * Open incidents for heartbeats that are past due. Runs every minute from the
 * scheduler. Returns how many incidents it opened.
 */
export async function sweepMissedHeartbeats(now: Date = new Date()): Promise<number> {
  const db = getDb();
  const candidates = await db
    .select()
    .from(monitors)
    .where(
      and(
        eq(monitors.type, "heartbeat"),
        ne(monitors.status, "paused"),
        ne(monitors.status, "down"),
        isNotNull(monitors.pingToken),
      ),
    );

  let opened = 0;
  for (const monitor of candidates) {
    const deadline = dueBy(monitor, now);
    if (!deadline || now <= deadline) continue;

    // Don't stack incidents if one is somehow already open.
    const [existing] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(
        and(
          eq(incidents.monitorId, monitor.id),
          eq(incidents.kind, "missed_heartbeat"),
          isNull(incidents.resolvedAt),
        ),
      );
    if (existing) continue;

    const summary = monitor.lastPingAt
      ? `No ping since ${ago(monitor.lastPingAt, now)} (expected by ${deadline
          .toISOString()
          .slice(11, 16)} UTC)`
      : "Never pinged since the monitor was created";

    await openIncident({
      monitor,
      kind: "missed_heartbeat",
      title: `${monitor.name} missed its ping`,
      triggerSummary: summary,
    });
    opened += 1;
  }
  return opened;
}

/* -------------------------------------------------------------- snippets --- */

/** Copy-paste setup snippets (ROADMAP week 4). Real, runnable, no placeholders. */
export function pingSnippets(url: string): { label: string; language: string; code: string }[] {
  return [
    {
      label: "crontab",
      language: "bash",
      code: `0 3 * * * /usr/local/bin/backup.sh && curl -fsS -m 10 --retry 3 ${url}`,
    },
    {
      label: "shell (report failures too)",
      language: "bash",
      code: `#!/usr/bin/env bash\nset -o pipefail\nif /usr/local/bin/backup.sh; then\n  curl -fsS -m 10 --retry 3 "${url}"\nelse\n  curl -fsS -m 10 --retry 3 "${url}/fail?status=$?"\nfi`,
    },
    {
      label: "GitHub Actions",
      language: "yaml",
      code: `- name: Notify PulseWatch\n  if: success()\n  run: curl -fsS -m 10 --retry 3 "${url}"`,
    },
    {
      label: "Node",
      language: "javascript",
      code: `await fetch("${url}", { method: "POST" });`,
    },
    {
      label: "Python",
      language: "python",
      code: `import urllib.request\nurllib.request.urlopen("${url}", timeout=10)`,
    },
  ];
}

/** Recent pings for the monitor detail screen. */
export async function recentPings(monitorId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(heartbeatPings)
    .where(eq(heartbeatPings.monitorId, monitorId))
    .orderBy(sql`${heartbeatPings.receivedAt} desc`)
    .limit(limit);
}
