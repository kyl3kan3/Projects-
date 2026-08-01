/**
 * The order-count meter.
 *
 * Its own module because both ingestion (which decides whether to schedule an
 * outreach) and scheduling (which re-checks) need it, and putting it in either
 * one would make them import each other.
 *
 * Counts are always measured from `merchants.period_started_at` rather than
 * accumulated in a column: a counter that drifts is a billing dispute, and a
 * count that can be recomputed from the orders table can always be defended.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, orders, stores, type Tier } from "@/db/schema";
import { meter, type Metering } from "@/lib/plans";

/** Orders for every store this merchant owns, in the current window. */
export async function ordersThisPeriod(merchantId: string): Promise<number> {
  const db = getDb();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!merchant) return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(stores, eq(stores.id, orders.storeId))
    .where(and(eq(stores.merchantId, merchantId), gte(orders.createdAt, merchant.periodStartedAt)));
  return Number(row?.n ?? 0);
}

export async function meteringFor(merchantId: string, tier: Tier): Promise<Metering> {
  return meter(tier, await ordersThisPeriod(merchantId));
}

/**
 * Roll the metering window forward when a month has passed.
 *
 * Stripe drives this for paying merchants (its billing period is the truth), so
 * this exists for the Free tier: without it, 50 orders would be a lifetime
 * allowance rather than a monthly one. Called from the cron sweep.
 */
export async function rollPeriodIfDue(
  merchantId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const db = getDb();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!merchant) return false;
  if (now.getTime() - merchant.periodStartedAt.getTime() < 30 * 86_400_000) return false;
  await db.update(merchants).set({ periodStartedAt: now }).where(eq(merchants.id, merchantId));
  return true;
}

export async function startNewPeriod(merchantId: string, at: Date = new Date()): Promise<void> {
  const db = getDb();
  await db.update(merchants).set({ periodStartedAt: at }).where(eq(merchants.id, merchantId));
}
