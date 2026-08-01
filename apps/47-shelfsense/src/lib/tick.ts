/**
 * The tick: everything a background worker would do, in one bounded pass.
 *
 * ARCHITECTURE.md describes a BullMQ worker on Redis. The deployment target is
 * Vercel + Neon, where there are no always-on processes, so the portfolio's
 * standing answer applies (root DEPLOYING.md, and `apps/05-pulsewatch` does the
 * same): the work is a cron-triggered route with a time budget, and the queue's job
 * is done by the database. `webhook_events.processed_at` *is* a work queue,
 * `shops.backfill_cursor` *is* a checkpoint, and `shops.last_recompute_date` *is* a
 * schedule. Nothing is lost — retries, resumption and idempotency are all still
 * here, they just live in Postgres rather than Redis, which removes a service and
 * a consumer process from the deployment.
 *
 * `npm run worker` runs the same function on a loop for anyone who would rather
 * host a long-lived process.
 *
 * Order matters: webhooks first (so a recompute sees the freshest inventory),
 * then backfills, then recomputes, then digests (so a digest quotes today's run).
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { shops, type Shop } from "@/db/schema";
import { runBackfill, shopsNeedingBackfill } from "@/lib/backfill";
import { todayInZone } from "@/lib/dates";
import { activeShops, digestDueToday, sendDigest, sendOrderNowAlert } from "@/lib/digests";
import { markNotified, recomputeShop, shopsDueForRecompute } from "@/lib/forecast-run";
import { applyDemoSupplierAssignments } from "@/lib/install";
import { pendingEvents, processEvent } from "@/lib/webhooks";

export interface TickSummary {
  ok: true;
  webhooksProcessed: number;
  webhooksFailed: number;
  backfillsAdvanced: number;
  backfillsCompleted: number;
  shopsRecomputed: number;
  alertsRaised: number;
  alertEmails: number;
  digestsSent: number;
  digestsSkipped: number;
  tookMs: number;
  deadlineHit: boolean;
}

export interface TickOptions {
  /** Stop starting new work after this instant. */
  deadline?: number;
  webhookLimit?: number;
  backfillLimit?: number;
  recomputeLimit?: number;
  /** Skip the digest sweep — used by tests that only want the forecast path. */
  skipDigests?: boolean;
  now?: Date;
}

export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 45_000;
}

export async function runTick(options: TickOptions = {}): Promise<TickSummary> {
  const startedAt = Date.now();
  const deadline = options.deadline ?? startedAt + tickBudgetMs();
  const now = options.now ?? new Date();
  const summary: TickSummary = {
    ok: true,
    webhooksProcessed: 0,
    webhooksFailed: 0,
    backfillsAdvanced: 0,
    backfillsCompleted: 0,
    shopsRecomputed: 0,
    alertsRaised: 0,
    alertEmails: 0,
    digestsSent: 0,
    digestsSkipped: 0,
    tookMs: 0,
    deadlineHit: false,
  };

  /* --- 1. webhook deliveries --- */
  try {
    const events = await pendingEvents(options.webhookLimit ?? 100);
    for (const event of events) {
      if (Date.now() > deadline) {
        summary.deadlineHit = true;
        break;
      }
      const result = await processEvent(event);
      if (result.applied) summary.webhooksProcessed += 1;
      else summary.webhooksFailed += 1;
    }
  } catch (err) {
    console.error("[tick] webhook pass failed", err);
  }

  /* --- 2. backfills --- */
  if (Date.now() <= deadline) {
    try {
      const pending = await shopsNeedingBackfill(options.backfillLimit ?? 3);
      for (const shop of pending) {
        if (Date.now() > deadline) {
          summary.deadlineHit = true;
          break;
        }
        const progress = await runBackfill(shop, { deadline });
        summary.backfillsAdvanced += 1;
        if (progress.done) {
          summary.backfillsCompleted += 1;
          // The demo store's supplier assignments live outside Shopify, so they
          // are (re)applied once its catalogue exists.
          if (shop.isDemo) await applyDemoSupplierAssignments(shop);
        }
      }
    } catch (err) {
      console.error("[tick] backfill pass failed", err);
    }
  }

  /* --- 3. nightly recompute --- */
  if (Date.now() <= deadline) {
    try {
      const due = await shopsDueForRecompute(now, options.recomputeLimit ?? 10);
      for (const shop of due) {
        if (Date.now() > deadline) {
          summary.deadlineHit = true;
          break;
        }
        const result = await recomputeShop(shop, { deadline });
        summary.shopsRecomputed += 1;
        summary.alertsRaised += result.alertsRaised;

        if (result.newlyOrderNow.length) {
          const mail = await sendOrderNowAlert(shop, result.newlyOrderNow);
          if (mail.sent) {
            summary.alertEmails += 1;
            await markNotified(result.newlyOrderNow.map((c) => c.variantId));
          }
        }
      }
    } catch (err) {
      console.error("[tick] recompute pass failed", err);
    }
  }

  /* --- 4. digests --- */
  if (!options.skipDigests && Date.now() <= deadline) {
    try {
      const candidates = await activeShops(200);
      for (const shop of candidates) {
        if (Date.now() > deadline) {
          summary.deadlineHit = true;
          break;
        }
        const localDate = todayInZone(shop.timezone, now);
        for (const kind of ["weekly_reorder", "monthly_dead_stock"] as const) {
          if (!digestDueToday(kind, shop, localDate)) continue;
          const outcome = await sendDigest(shop, kind, { localDate });
          if (outcome.sent) summary.digestsSent += 1;
          else summary.digestsSkipped += 1;
        }
      }
    } catch (err) {
      console.error("[tick] digest pass failed", err);
    }
  }

  summary.tookMs = Date.now() - startedAt;
  return summary;
}

/**
 * Drive one shop from just-installed to has-a-dashboard, synchronously.
 *
 * Used by the connect screen so the merchant is not left staring at an empty
 * dashboard waiting for a cron they cannot see. It is the ordinary backfill and the
 * ordinary recompute, looped until the backfill reports done, with a hard page cap
 * so a huge store cannot hang a request — a store that big finishes on the tick.
 */
export async function onboardShop(
  shop: Shop,
  options: { deadline?: number; today?: string } = {},
): Promise<{ done: boolean; ordersImported: number; recomputed: boolean }> {
  const db = getDb();
  const deadline = options.deadline ?? Date.now() + 120_000;
  let current = shop;
  let done = false;
  let ordersImported = 0;

  for (let pass = 0; pass < 40; pass++) {
    const progress = await runBackfill(current, { deadline, today: options.today });
    ordersImported = progress.ordersImported;
    if (progress.done) {
      done = true;
      break;
    }
    if (Date.now() > deadline) break;
    const [reloaded] = await db.select().from(shops).where(eq(shops.id, shop.id)).limit(1);
    if (!reloaded) break;
    current = reloaded;
  }

  if (!done) return { done, ordersImported, recomputed: false };

  if (current.isDemo) await applyDemoSupplierAssignments(current);

  const [fresh] = await db.select().from(shops).where(eq(shops.id, shop.id)).limit(1);
  if (!fresh) return { done, ordersImported, recomputed: false };

  await recomputeShop(fresh, { deadline: Date.now() + 60_000, runDate: options.today });
  return { done, ordersImported, recomputed: true };
}

/** Health probe for a long-lived worker host. */
export async function tickHealth(): Promise<{ ok: boolean; shops: number }> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(shops)
    .where(and(isNull(shops.uninstalledAt)));
  return { ok: true, shops: row?.n ?? 0 };
}
