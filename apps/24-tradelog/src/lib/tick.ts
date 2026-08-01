/**
 * The periodic tick: broker syncs and the nightly leak recompute.
 *
 * TradeLog has no always-on process (see lib/runtime.ts). This function is the
 * whole of the background work, and it is written to be interrupted: it works
 * through accounts oldest-sync-first inside a time budget and stops cleanly when
 * the budget is spent, leaving the rest for the next tick. Nothing here depends
 * on having finished — a half-run tick leaves the data consistent, just less
 * fresh.
 */

import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { accountsDueForSync, syncAccount, type SyncResult } from "@/lib/sync";
import { recomputeFindings } from "@/lib/findings";
import { tickBudgetMs } from "@/lib/runtime";

export interface TickReport {
  startedAt: string;
  durationMs: number;
  syncs: SyncResult[];
  usersRecomputed: number;
  /** True when the budget ran out and work was left for the next tick. */
  truncated: boolean;
}

export async function runTick(now = new Date()): Promise<TickReport> {
  const startedAt = now.getTime();
  const budget = tickBudgetMs();
  const deadline = startedAt + budget;
  const spent = () => Date.now() >= deadline;

  const syncs: SyncResult[] = [];
  let truncated = false;

  for (const { account, user } of await accountsDueForSync()) {
    if (spent()) {
      truncated = true;
      break;
    }
    // Each sync gets what remains of the budget, so one hanging request cannot
    // consume the tick.
    const controller = new AbortController();
    const remaining = Math.max(1_000, deadline - Date.now());
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      syncs.push(await syncAccount(user, account, controller.signal));
    } finally {
      clearTimeout(timer);
    }
  }

  // Leaks are recomputed on import too; this catches the case where a finding's
  // sample-size gate is crossed by the passage of time rather than by new trades.
  let usersRecomputed = 0;
  if (!spent()) {
    const everyone: User[] = await getDb().select().from(users);
    for (const user of everyone) {
      if (spent()) {
        truncated = true;
        break;
      }
      try {
        await recomputeFindings(user);
        usersRecomputed += 1;
      } catch (err) {
        console.error(`[tick] leak recompute failed for ${user.id}`, err);
      }
    }
  } else {
    truncated = true;
  }

  return {
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    syncs,
    usersRecomputed,
    truncated,
  };
}
