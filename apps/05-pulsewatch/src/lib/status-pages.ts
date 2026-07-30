/**
 * Public status pages.
 *
 * The public read path must never scan `check_results` — a status page can get
 * an HN spike at exactly the moment the service it reports on is struggling.
 * Everything here reads the `uptime_daily` rollup plus the incident tables, and
 * the route caches for 30s on top of that (ARCHITECTURE.md flow 4).
 */

import { and, asc, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  incidents,
  incidentUpdates,
  monitors,
  statusPageMonitors,
  statusPages,
  uptimeDaily,
  type Incident,
  type Monitor,
  type MonitorStatus,
  type StatusPage,
} from "@/db/schema";
import { plan } from "@/lib/plans";
import type { PlanId } from "@/db/schema";

export class StatusPageError extends Error {}

export const UPTIME_WINDOW_DAYS = 90;

/** One cell of the 90-day bar. */
export interface UptimeCell {
  day: string;
  /** null = no data collected that day (renders as an empty cell, not a lie). */
  uptime: number | null;
  hadIncident: boolean;
  isToday: boolean;
}

export interface StatusPageService {
  monitor: Monitor;
  displayName: string;
  cells: UptimeCell[];
  uptime90: number | null;
}

export interface StatusPageView {
  page: StatusPage;
  services: StatusPageService[];
  /** Worst current state across the page's monitors. */
  overall: "operational" | "degraded" | "outage";
  incidents: (Incident & { updates: { body: string; postedAt: Date }[] })[];
  showBadge: boolean;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ CRUD --- */

export async function createStatusPage(input: {
  teamId: string;
  planId: PlanId;
  slug: string;
  title: string;
  description?: string | null;
  monitorIds: string[];
}): Promise<StatusPage> {
  const db = getDb();
  const limits = plan(input.planId);

  const existing = await db
    .select({ id: statusPages.id })
    .from(statusPages)
    .where(eq(statusPages.teamId, input.teamId));
  if (existing.length >= limits.statusPages) {
    throw new StatusPageError(
      `The ${limits.name} plan includes ${limits.statusPages} status page${
        limits.statusPages === 1 ? "" : "s"
      }.`,
    );
  }

  const slug = input.slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length < 3) throw new StatusPageError("Slug needs at least 3 characters");
  const [clash] = await db.select().from(statusPages).where(eq(statusPages.slug, slug));
  if (clash) throw new StatusPageError("That address is taken");

  const [page] = await db
    .insert(statusPages)
    .values({
      teamId: input.teamId,
      slug,
      title: input.title.trim() || slug,
      description: input.description?.trim() || null,
      // Free tier keeps the badge — it is the compounding channel (README GTM).
      showBadge: input.planId === "free",
    })
    .returning();

  await setStatusPageMonitors(page.id, input.teamId, input.monitorIds);
  return page;
}

export async function setStatusPageMonitors(
  statusPageId: string,
  teamId: string,
  monitorIds: string[],
): Promise<void> {
  const db = getDb();
  // Only ever attach monitors the team actually owns.
  const owned = monitorIds.length
    ? await db
        .select({ id: monitors.id })
        .from(monitors)
        .where(and(eq(monitors.teamId, teamId), inArray(monitors.id, monitorIds)))
    : [];

  await db.delete(statusPageMonitors).where(eq(statusPageMonitors.statusPageId, statusPageId));
  if (!owned.length) return;
  await db.insert(statusPageMonitors).values(
    owned.map((m, i) => ({
      statusPageId,
      monitorId: m.id,
      sortOrder: i,
      displayName: null,
    })),
  );
}

export async function listStatusPages(teamId: string): Promise<StatusPage[]> {
  const db = getDb();
  return db
    .select()
    .from(statusPages)
    .where(eq(statusPages.teamId, teamId))
    .orderBy(statusPages.createdAt);
}

export async function deleteStatusPage(id: string, teamId: string): Promise<void> {
  const db = getDb();
  await db.delete(statusPages).where(and(eq(statusPages.id, id), eq(statusPages.teamId, teamId)));
}

export async function setPublished(id: string, teamId: string, published: boolean): Promise<void> {
  const db = getDb();
  await db
    .update(statusPages)
    .set({ published })
    .where(and(eq(statusPages.id, id), eq(statusPages.teamId, teamId)));
}

/* ------------------------------------------------------------ public read --- */

export async function loadStatusPage(slug: string): Promise<StatusPageView | null> {
  const db = getDb();
  const [page] = await db.select().from(statusPages).where(eq(statusPages.slug, slug));
  if (!page || !page.published) return null;

  const rows = await db
    .select({ monitor: monitors, link: statusPageMonitors })
    .from(statusPageMonitors)
    .innerJoin(monitors, eq(monitors.id, statusPageMonitors.monitorId))
    .where(eq(statusPageMonitors.statusPageId, page.id))
    .orderBy(asc(statusPageMonitors.sortOrder));

  const monitorIds = rows.map((r) => r.monitor.id);
  const since = startOfUtcDay(new Date(Date.now() - (UPTIME_WINDOW_DAYS - 1) * 86_400_000));

  const rollups = monitorIds.length
    ? await db
        .select()
        .from(uptimeDaily)
        .where(and(inArray(uptimeDaily.monitorId, monitorIds), gte(uptimeDaily.day, since)))
    : [];

  const incidentRows = monitorIds.length
    ? await db
        .select()
        .from(incidents)
        .where(
          and(
            gte(incidents.startedAt, since),
            // Monitor incidents for this page, plus team-wide manual posts.
            or(inArray(incidents.monitorId, monitorIds), isNull(incidents.monitorId)),
            eq(incidents.teamId, page.teamId),
          ),
        )
        .orderBy(desc(incidents.startedAt))
        .limit(50)
    : await db
        .select()
        .from(incidents)
        .where(and(eq(incidents.teamId, page.teamId), eq(incidents.kind, "manual")))
        .orderBy(desc(incidents.startedAt))
        .limit(50);

  // Days that carried an incident, per monitor, so a bar cell can go red even
  // when the rollup for that day looks healthy on average.
  const incidentDays = new Map<string, Set<string>>();
  for (const inc of incidentRows) {
    if (!inc.monitorId) continue;
    if (inc.kind === "ssl_expiry" || inc.kind === "domain_expiry") continue;
    const end = inc.resolvedAt ?? new Date();
    for (let t = startOfUtcDay(inc.startedAt).getTime(); t <= end.getTime(); t += 86_400_000) {
      const set = incidentDays.get(inc.monitorId) ?? new Set<string>();
      set.add(dayKey(new Date(t)));
      incidentDays.set(inc.monitorId, set);
    }
  }

  const todayKey = dayKey(new Date());
  const services: StatusPageService[] = rows.map(({ monitor, link }) => {
    const byDay = new Map(
      rollups
        .filter((r) => r.monitorId === monitor.id)
        .map((r) => [dayKey(r.day), r] as const),
    );

    const cells: UptimeCell[] = [];
    let okTotal = 0;
    let allTotal = 0;
    for (let i = UPTIME_WINDOW_DAYS - 1; i >= 0; i--) {
      const d = startOfUtcDay(new Date(Date.now() - i * 86_400_000));
      const key = dayKey(d);
      const row = byDay.get(key);
      const hadIncident = incidentDays.get(monitor.id)?.has(key) ?? false;
      if (row && row.totalChecks > 0) {
        okTotal += row.okChecks;
        allTotal += row.totalChecks;
      }
      cells.push({
        day: key,
        uptime: row && row.totalChecks > 0 ? row.okChecks / row.totalChecks : null,
        hadIncident,
        isToday: key === todayKey,
      });
    }

    return {
      monitor,
      displayName: link.displayName ?? monitor.name,
      cells,
      uptime90: allTotal > 0 ? okTotal / allTotal : null,
    };
  });

  const statuses = services.map((s) => s.monitor.status);
  const overall: StatusPageView["overall"] = statuses.includes("down")
    ? "outage"
    : statuses.some((s) => s === "pending")
      ? "degraded"
      : "operational";

  const updatesByIncident = incidentRows.length
    ? await db
        .select()
        .from(incidentUpdates)
        .where(
          and(
            inArray(
              incidentUpdates.incidentId,
              incidentRows.map((i) => i.id),
            ),
            eq(incidentUpdates.visibility, "public"),
          ),
        )
        .orderBy(asc(incidentUpdates.postedAt))
    : [];

  return {
    page,
    services,
    overall,
    incidents: incidentRows.map((inc) => ({
      ...inc,
      updates: updatesByIncident
        .filter((u) => u.incidentId === inc.id)
        .map((u) => ({ body: u.body, postedAt: u.postedAt })),
    })),
    showBadge: page.showBadge,
  };
}

/** Human label for a monitor's current state, used on the public page. */
export function statusLabel(status: MonitorStatus): string {
  switch (status) {
    case "up":
      return "Operational";
    case "down":
      return "Outage";
    case "paused":
      return "Paused";
    default:
      return "Pending";
  }
}
