/**
 * The nightly recompute — the product's heartbeat.
 *
 * For every tracked variant: velocities, blend, reorder point, order-by date,
 * revenue at risk, status, and the `inputs` audit trail the "show the math" panel
 * renders verbatim. Then alert transitions, then the shop-level aggregate.
 *
 * Three properties this deliberately guarantees:
 *
 *  - **Idempotent per day.** Forecast rows are keyed `(variant, run_date)` and
 *    upserted, so running the recompute twice on the same day produces the same
 *    dashboard and — because alerts are raised on an insert that can only succeed
 *    once — exactly one notification.
 *  - **The headline equals the drill-downs.** Revenue at risk is integer cents per
 *    variant, summed as integers. There is no shop-level formula that could drift
 *    from the rows beneath it.
 *  - **Status is derived at display time too.** The stored status is what the run
 *    computed; the dashboard reads the run's own date and says how old it is rather
 *    than presenting a week-old "Healthy" as current fact.
 */

import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  alerts,
  forecasts,
  salesDaily,
  shops,
  suppliers,
  variants,
  type Shop,
  type ForecastInputs,
  type ForecastStatus,
} from "@/db/schema";
import { addDays, hourInZone, todayInZone } from "@/lib/dates";
import { inferTrailingStockout, markStockoutDay } from "@/lib/ingest";
import { plan as planDef } from "@/lib/plans";
import { planReorder } from "@/lib/reorder";
import { resolveSettings, thresholdsFrom } from "@/lib/settings";
import { velocityProfile, type DailySales } from "@/lib/velocity";

export interface RecomputeResult {
  shopId: string;
  runDate: string;
  variantsConsidered: number;
  variantsForecast: number;
  skippedOverCap: number;
  revenueAtRiskCents: number;
  cashInDeadStockCents: number;
  byStatus: Record<ForecastStatus, number>;
  alertsRaised: number;
  alertsResolved: number;
  newlyOrderNow: { variantId: string; sku: string; title: string }[];
  deferred: boolean;
}

export interface RecomputeOptions {
  runDate?: string;
  deadline?: number;
}

const HISTORY_DAYS = 90;
const FORECAST_RETENTION_DAYS = 180;

/**
 * Recompute one shop.
 *
 * The whole shop is done in one pass, and it is cheap: arithmetic over an indexed
 * 90-day slice of `sales_daily`, one row written per variant. The deadline exists
 * for the 5,000-SKU case on a cold serverless function, and a deferred run simply
 * leaves the remaining variants on yesterday's forecast until the next tick.
 */
export async function recomputeShop(
  shop: Shop,
  options: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const db = getDb();
  const runDate = options.runDate ?? todayInZone(shop.timezone);
  const deadline = options.deadline ?? Date.now() + 120_000;
  const settings = resolveSettings(shop.settings);
  const thresholds = thresholdsFrom(settings);
  const cap = planDef(shop.plan).skuCap;

  const from = addDays(runDate, -HISTORY_DAYS);
  const to = addDays(runDate, -1);

  const rows = await db
    .select({
      id: variants.id,
      sku: variants.sku,
      title: variants.title,
      priceCents: variants.priceCents,
      costCents: variants.costCents,
      moq: variants.moq,
      packSize: variants.packSize,
      inventoryQuantity: variants.inventoryQuantity,
      firstSaleOn: variants.firstSaleOn,
      snoozedUntil: variants.snoozedUntil,
      supplierLeadTimeDays: suppliers.leadTimeDays,
    })
    .from(variants)
    .leftJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(and(eq(variants.shopId, shop.id), eq(variants.tracked, true)))
    .orderBy(asc(variants.sku));

  // Units over the last 30 days, per variant — the ranking used when a shop is
  // over its plan's SKU cap, so the SKUs that still sell are the ones that keep
  // being forecast.
  const recent = await db
    .select({
      variantId: salesDaily.variantId,
      units: sql<number>`coalesce(sum(${salesDaily.unitsSold}), 0)::int`,
    })
    .from(salesDaily)
    .where(
      and(
        eq(salesDaily.shopId, shop.id),
        gte(salesDaily.date, addDays(runDate, -30)),
        lte(salesDaily.date, to),
      ),
    )
    .groupBy(salesDaily.variantId);
  const recentUnits = new Map(recent.map((r) => [r.variantId, r.units]));

  const ranked = [...rows].sort((a, b) => {
    const diff = (recentUnits.get(b.id) ?? 0) - (recentUnits.get(a.id) ?? 0);
    return diff !== 0 ? diff : a.sku.localeCompare(b.sku);
  });
  const inScope = ranked.slice(0, cap);
  const skippedOverCap = ranked.length - inScope.length;

  const history = await loadHistory(
    shop.id,
    inScope.map((v) => v.id),
    from,
    to,
  );

  const byStatus: Record<ForecastStatus, number> = {
    order_now: 0,
    order_soon: 0,
    healthy: 0,
    overstocked: 0,
    dead: 0,
  };
  let revenueAtRiskCents = 0;
  let cashInDeadStockCents = 0;
  let alertsRaised = 0;
  let alertsResolved = 0;
  const newlyOrderNow: RecomputeResult["newlyOrderNow"] = [];
  let variantsForecast = 0;
  let deferred = false;
  const now = new Date();

  for (const variant of inScope) {
    if (Date.now() > deadline) {
      deferred = true;
      break;
    }

    // Record today's censoring before anything reads it, and re-infer the
    // trailing run so a stockout that started yesterday is not read as demand.
    await markStockoutDay(shop.id, variant.id, runDate, variant.inventoryQuantity <= 0);
    if (variant.inventoryQuantity <= 0) {
      await inferTrailingStockout(shop.id, variant, to, HISTORY_DAYS);
    }

    const days = history.get(variant.id) ?? [];
    const profile = velocityProfile(days, runDate, variant.firstSaleOn);
    const leadTimeDays = variant.supplierLeadTimeDays ?? settings.defaultLeadTimeDays;
    const hasSalesHistory = Boolean(variant.firstSaleOn);

    /**
     * Rounded **once**, here, and then used for everything downstream.
     *
     * The reorder point has to be reproducible from the velocity the UI shows, because
     * "honest math, shown" is the product's differentiator and a panel whose inputs do
     * not give its own answer is worse than no panel. Feeding `planReorder` the full
     * float while storing a 3-decimal one put a SKU on screen whose displayed velocity
     * implied a reorder point of 106 against a stored 105 — a merchant checking the
     * arithmetic would have found the app wrong.
     */
    const blendedVelocity = round3(profile.blended);

    const suggestion = planReorder({
      asOf: runDate,
      velocity: blendedVelocity,
      available: variant.inventoryQuantity,
      leadTimeDays,
      safetyDays: settings.safetyDays,
      coverTargetDays: settings.coverTargetDays,
      moq: variant.moq,
      packSize: variant.packSize,
      priceCents: variant.priceCents,
      costCents: variant.costCents,
      trend: profile.trend,
      confidence: profile.confidence,
      observedDays: profile.observedDays,
      demandCensored: profile.demandCensored,
      hasSalesHistory,
      thresholds,
    });

    const inputs: ForecastInputs = {
      asOf: runDate,
      velocity7d: round3(profile.w7.velocity),
      velocity30d: round3(profile.w30.velocity),
      velocity90d: round3(profile.w90.velocity),
      blendedVelocity,
      windows: [profile.w7, profile.w30, profile.w90].map((w) => ({
        windowDays: w.windowDays,
        units: w.units,
        observedDays: w.observedDays,
        censoredDays: w.censoredDays,
        velocity: round3(w.velocity),
        hasData: w.hasData,
      })),
      weights: {
        w7: round3(profile.weights.w7),
        w30: round3(profile.weights.w30),
        w90: round3(profile.weights.w90),
      },
      leadTimeDays,
      leadTimeSource: variant.supplierLeadTimeDays !== null ? "supplier" : "default",
      safetyDays: settings.safetyDays,
      coverTargetDays: settings.coverTargetDays,
      moq: variant.moq,
      packSize: variant.packSize,
      available: variant.inventoryQuantity,
      priceCents: variant.priceCents,
      costCents: variant.costCents,
      trend: profile.trend,
      confidence: profile.confidence,
      observedDays: profile.observedDays,
      demandCensored: profile.demandCensored,
      notes: suggestion.notes,
    };

    await db
      .insert(forecasts)
      .values({
        shopId: shop.id,
        variantId: variant.id,
        runDate,
        velocity7d: inputs.velocity7d,
        velocity30d: inputs.velocity30d,
        velocity90d: inputs.velocity90d,
        blendedVelocity: inputs.blendedVelocity,
        daysOfCover: suggestion.daysOfCover,
        reorderPoint: suggestion.reorderPoint,
        reorderQty: suggestion.suggestedQty,
        orderByDate: suggestion.orderByDate,
        stockoutDate: suggestion.stockoutDate,
        revenueAtRiskCents: suggestion.revenueAtRiskCents,
        cashTiedUpCents: suggestion.cashTiedUpCents,
        available: variant.inventoryQuantity,
        status: suggestion.status,
        trend: profile.trend,
        confidence: profile.confidence,
        inputs,
      })
      .onConflictDoUpdate({
        target: [forecasts.variantId, forecasts.runDate],
        set: {
          velocity7d: inputs.velocity7d,
          velocity30d: inputs.velocity30d,
          velocity90d: inputs.velocity90d,
          blendedVelocity: inputs.blendedVelocity,
          daysOfCover: suggestion.daysOfCover,
          reorderPoint: suggestion.reorderPoint,
          reorderQty: suggestion.suggestedQty,
          orderByDate: suggestion.orderByDate,
          stockoutDate: suggestion.stockoutDate,
          revenueAtRiskCents: suggestion.revenueAtRiskCents,
          cashTiedUpCents: suggestion.cashTiedUpCents,
          available: variant.inventoryQuantity,
          status: suggestion.status,
          trend: profile.trend,
          confidence: profile.confidence,
          inputs,
        },
      });

    byStatus[suggestion.status] += 1;
    revenueAtRiskCents += suggestion.revenueAtRiskCents;
    if (suggestion.status === "dead") cashInDeadStockCents += suggestion.cashTiedUpCents;
    variantsForecast += 1;

    /* --- alert transitions --- */
    const snoozed = variant.snoozedUntil !== null && variant.snoozedUntil > now;

    if (suggestion.status === "order_now" && !snoozed) {
      const raised = await raiseAlert(shop.id, variant.id, "stockout_risk");
      if (raised) {
        alertsRaised += 1;
        newlyOrderNow.push({ variantId: variant.id, sku: variant.sku, title: variant.title });
      }
    } else {
      alertsResolved += (await resolveAlert(variant.id, "stockout_risk")) ? 1 : 0;
    }

    if (suggestion.status === "dead" && !snoozed) {
      if (await raiseAlert(shop.id, variant.id, "dead_stock")) alertsRaised += 1;
    } else {
      alertsResolved += (await resolveAlert(variant.id, "dead_stock")) ? 1 : 0;
    }
  }

  await db
    .update(shops)
    .set({
      lastRecomputeAt: new Date(),
      lastRecomputeDate: deferred ? shop.lastRecomputeDate : runDate,
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id));

  await pruneForecasts(shop.id, runDate);

  return {
    shopId: shop.id,
    runDate,
    variantsConsidered: ranked.length,
    variantsForecast,
    skippedOverCap,
    revenueAtRiskCents,
    cashInDeadStockCents,
    byStatus,
    alertsRaised,
    alertsResolved,
    newlyOrderNow,
    deferred,
  };
}

/* --------------------------------------------------------------- helpers --- */

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** One query for the whole shop's window, bucketed per variant in memory. */
async function loadHistory(
  shopId: string,
  variantIds: string[],
  from: string,
  to: string,
): Promise<Map<string, DailySales[]>> {
  const out = new Map<string, DailySales[]>();
  if (!variantIds.length) return out;
  const db = getDb();

  // Chunked so a 5,000-SKU shop does not build a 5,000-element IN list.
  const CHUNK = 500;
  for (let i = 0; i < variantIds.length; i += CHUNK) {
    const chunk = variantIds.slice(i, i + CHUNK);
    const rows = await db
      .select({
        variantId: salesDaily.variantId,
        date: salesDaily.date,
        unitsSold: salesDaily.unitsSold,
        stockout: salesDaily.stockout,
      })
      .from(salesDaily)
      .where(
        and(
          eq(salesDaily.shopId, shopId),
          inArray(salesDaily.variantId, chunk),
          gte(salesDaily.date, from),
          lte(salesDaily.date, to),
        ),
      );
    for (const row of rows) {
      const list = out.get(row.variantId) ?? [];
      list.push({ date: row.date, unitsSold: row.unitsSold, inStock: !row.stockout });
      out.set(row.variantId, list);
    }
  }
  return out;
}

/**
 * Open an alert if one is not already open. Returns true only on the transition.
 *
 * The partial-unique index on `(open_variant_id, kind)` makes this a single
 * insert: a second attempt while the alert is open conflicts and reports false, so
 * "still order_now tomorrow" cannot mail the merchant again. That is the failure
 * mode where an overdue state stays true forever and a naive sweep notifies daily
 * until the merchant filters the sender.
 */
export async function raiseAlert(
  shopId: string,
  variantId: string,
  kind: "stockout_risk" | "dead_stock",
): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(alerts)
    .values({ shopId, variantId, kind, openVariantId: variantId })
    .onConflictDoNothing({ target: [alerts.openVariantId, alerts.kind] })
    .returning({ id: alerts.id });
  return inserted.length > 0;
}

/** Close an open alert. Returns true only on the transition out. */
export async function resolveAlert(
  variantId: string,
  kind: "stockout_risk" | "dead_stock",
): Promise<boolean> {
  const db = getDb();
  const updated = await db
    .update(alerts)
    .set({ resolvedAt: new Date(), openVariantId: null })
    .where(
      and(
        eq(alerts.openVariantId, variantId),
        eq(alerts.kind, kind),
        isNull(alerts.resolvedAt),
      ),
    )
    .returning({ id: alerts.id });
  return updated.length > 0;
}

/** Mark the SKUs in a notification as notified, so a resend can be spotted. */
export async function markNotified(variantIds: string[]): Promise<void> {
  if (!variantIds.length) return;
  const db = getDb();
  await db
    .update(alerts)
    .set({ lastNotifiedAt: new Date() })
    .where(and(inArray(alerts.openVariantId, variantIds), eq(alerts.kind, "stockout_risk")));
}

/**
 * Drop forecast rows past the retention window.
 *
 * The cutoff is passed as a date string with an explicit cast rather than as a JS
 * `Date` inside the fragment: a `Date` handed to a raw `sql` template skips
 * Drizzle's column encoder and the driver throws at runtime.
 */
async function pruneForecasts(shopId: string, runDate: string): Promise<void> {
  const db = getDb();
  const cutoff = addDays(runDate, -FORECAST_RETENTION_DAYS);
  await db
    .delete(forecasts)
    .where(and(eq(forecasts.shopId, shopId), lte(forecasts.runDate, cutoff)));
}

/**
 * Shops due for a nightly run, each in its own local time.
 *
 * Dueness is a *date* comparison — "has today's run happened yet?" — held against
 * `last_recompute_date`, a plain date column. It is deliberately not a
 * `timestamptz` compared against a JS `Date`: JS truncates to milliseconds while
 * Postgres keeps microseconds, so a row whose timestamp came from SQL `now()` reads
 * as due and then never claims, which is a scheduler that silently never runs.
 *
 * The local-hour gate is applied here in JS rather than in SQL because there is no
 * portable way to ask Postgres "what hour is it in this row's timezone" without
 * the shop's zone in the query, and getting it wrong means a shop's nightly run
 * lands in its afternoon.
 */
export async function shopsDueForRecompute(
  now: Date = new Date(),
  limit = 20,
  minLocalHour = 2,
): Promise<Shop[]> {
  const db = getDb();
  const candidates = await db
    .select()
    .from(shops)
    .where(and(isNull(shops.uninstalledAt), sql`${shops.backfillCompletedAt} is not null`))
    .orderBy(sql`${shops.lastRecomputeAt} asc nulls first`)
    .limit(limit * 4);

  const due: Shop[] = [];
  for (const shop of candidates) {
    const localDate = todayInZone(shop.timezone, now);
    if (shop.lastRecomputeDate === localDate) continue;
    // A shop that has never been forecast runs immediately — the merchant is
    // watching the onboarding screen and 02:00 is up to a day away.
    if (shop.lastRecomputeDate !== null && hourInZone(shop.timezone, now) < minLocalHour) continue;
    due.push(shop);
    if (due.length >= limit) break;
  }
  return due;
}
