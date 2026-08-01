/**
 * The scheduled sweep, called by /api/cron/tick.
 *
 * ARCHITECTURE.md draws no worker for v1 and that holds: everything scheduled here
 * is a daily/hourly pass with database-level idempotency, which a cron-triggered
 * route does perfectly well. It is bounded by a time budget so a slow pass stops and
 * lets the next tick continue rather than being killed mid-way.
 *
 * Two jobs:
 *  1. Reminder rungs (T-7/T-3/T-1 by default), deduped per rung.
 *  2. Due-date rollover: a project past its date whose packages have bids moves from
 *     `bidding` to `leveling`, because that is what the estimator is now doing. This
 *     is a convenience, not a source of truth — every status the UI shows for an
 *     invitation is derived as-of-now regardless.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { bids, projects, tradePackages } from "@/db/schema";
import { reminderSweep, type SweepResult } from "@/lib/invites";
import { tickBudgetMs } from "@/lib/runtime";

export interface TickResult {
  reminders: SweepResult;
  projectsRolledToLeveling: number;
  ranForMs: number;
}

export async function tick(now: Date = new Date()): Promise<TickResult> {
  const started = Date.now();
  const budget = tickBudgetMs();

  const reminders = await reminderSweep(now, { budgetMs: Math.floor(budget * 0.8) });
  const projectsRolledToLeveling = await rollOverDueProjects(now);

  return { reminders, projectsRolledToLeveling, ranForMs: Date.now() - started };
}

/**
 * Past-due projects that are still marked `bidding` move to `leveling`.
 *
 * The comparison is `lt(projects.bidDueAt, now)` through Drizzle's typed operator,
 * not a raw `sql` fragment with a Date interpolated into it — postgres.js cannot
 * encode a Date inside a raw fragment and the query throws at runtime, which is the
 * kind of failure that only shows up in production at 2am.
 */
async function rollOverDueProjects(now: Date): Promise<number> {
  const db = getDb();
  const due = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.status, "bidding"), lt(projects.bidDueAt, now)));
  if (due.length === 0) return 0;

  const ids = due.map((p) => p.id);
  const pkgs = await db
    .select({ id: tradePackages.id, projectId: tradePackages.projectId })
    .from(tradePackages)
    .where(inArray(tradePackages.projectId, ids));
  if (pkgs.length === 0) return 0;

  const submitted = await db
    .select({ tradePackageId: bids.tradePackageId })
    .from(bids)
    .where(
      and(
        inArray(
          bids.tradePackageId,
          pkgs.map((p) => p.id),
        ),
        eq(bids.isDraft, false),
      ),
    );
  const packagesWithBids = new Set(submitted.map((b) => b.tradePackageId));
  const projectsWithBids = [
    ...new Set(pkgs.filter((p) => packagesWithBids.has(p.id)).map((p) => p.projectId)),
  ];
  if (projectsWithBids.length === 0) return 0;

  await db
    .update(projects)
    .set({ status: "leveling" })
    .where(inArray(projects.id, projectsWithBids));
  return projectsWithBids.length;
}
