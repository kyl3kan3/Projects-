/**
 * Read models for the screens. One place where "what the dashboard shows" is
 * defined, so the reorder screen, the SKU detail, the dead-stock report, the PO
 * builder and the digest emails all read the same numbers from the same rows.
 *
 * Everything comes off the latest forecast run rather than being recomputed at
 * render time. That is what makes the "show the math" panel honest: the merchant
 * is auditing the numbers the engine actually used, not a second calculation that
 * happens to agree. The one thing the screens *do* derive live is how old the run
 * is, because rendering a stored status without saying when it was computed is how
 * an app ends up showing "Healthy" on a SKU that went dark on Tuesday.
 */

import { and, desc, eq, inArray, isNull, gt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  forecasts,
  poDraftLines,
  poDrafts,
  products,
  salesDaily,
  suppliers,
  variants,
  type Confidence,
  type ForecastInputs,
  type ForecastStatus,
  type Trend,
} from "@/db/schema";
import { addDays } from "@/lib/dates";

export interface SkuRow {
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string;
  /** "Cedar drawer sachets · 6-pack" — what a row shows as its title. */
  displayTitle: string;
  status: ForecastStatus;
  trend: Trend;
  confidence: Confidence;
  available: number;
  blendedVelocity: number;
  daysOfCover: number | null;
  reorderPoint: number;
  reorderQty: number;
  orderByDate: string | null;
  stockoutDate: string | null;
  revenueAtRiskCents: number;
  cashTiedUpCents: number;
  priceCents: number;
  costCents: number | null;
  moq: number;
  packSize: number;
  supplierId: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  leadTimeDays: number;
  snoozedUntil: Date | null;
  inputs: ForecastInputs;
  /** Status on the previous run, or null when this is the first run. */
  previousStatus: ForecastStatus | null;
  /** True when this SKU crossed into order-now on this run — the sweep signal. */
  crossedIntoOrderNow: boolean;
}

export interface ReorderBoard {
  runDate: string | null;
  rows: SkuRow[];
  totals: {
    revenueAtRiskCents: number;
    cashInDeadStockCents: number;
    orderNow: number;
    orderSoon: number;
    healthy: number;
    overstocked: number;
    dead: number;
    pastOrderBy: number;
    dueThisWeek: number;
  };
}

/** The most recent run we have forecasts for. Null before the first run. */
export async function latestRunDate(shopId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ runDate: forecasts.runDate })
    .from(forecasts)
    .where(eq(forecasts.shopId, shopId))
    .orderBy(desc(forecasts.runDate))
    .limit(1);
  return row?.runDate ?? null;
}

/**
 * Every forecast row from the latest run, ranked by urgency.
 *
 * Ranking is days-of-cover ascending with the "never runs out" SKUs last, which is
 * the order a merchant reads: whatever is closest to empty is at the top. The
 * status buckets the screen groups under are the same values the engine assigned;
 * the sort within a bucket is the cover.
 */
export async function reorderBoard(shopId: string): Promise<ReorderBoard> {
  const runDate = await latestRunDate(shopId);
  if (!runDate) {
    return {
      runDate: null,
      rows: [],
      totals: {
        revenueAtRiskCents: 0,
        cashInDeadStockCents: 0,
        orderNow: 0,
        orderSoon: 0,
        healthy: 0,
        overstocked: 0,
        dead: 0,
        pastOrderBy: 0,
        dueThisWeek: 0,
      },
    };
  }

  const db = getDb();
  const rows = await db
    .select({
      variantId: variants.id,
      sku: variants.sku,
      productTitle: products.title,
      variantTitle: variants.title,
      status: forecasts.status,
      trend: forecasts.trend,
      confidence: forecasts.confidence,
      available: forecasts.available,
      blendedVelocity: forecasts.blendedVelocity,
      daysOfCover: forecasts.daysOfCover,
      reorderPoint: forecasts.reorderPoint,
      reorderQty: forecasts.reorderQty,
      orderByDate: forecasts.orderByDate,
      stockoutDate: forecasts.stockoutDate,
      revenueAtRiskCents: forecasts.revenueAtRiskCents,
      cashTiedUpCents: forecasts.cashTiedUpCents,
      priceCents: variants.priceCents,
      costCents: variants.costCents,
      moq: variants.moq,
      packSize: variants.packSize,
      supplierId: variants.supplierId,
      supplierName: suppliers.name,
      supplierEmail: suppliers.email,
      supplierLeadTimeDays: suppliers.leadTimeDays,
      snoozedUntil: variants.snoozedUntil,
      inputs: forecasts.inputs,
    })
    .from(forecasts)
    .innerJoin(variants, eq(variants.id, forecasts.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(suppliers, eq(suppliers.id, variants.supplierId))
    .where(and(eq(forecasts.shopId, shopId), eq(forecasts.runDate, runDate)));

  // The previous run's statuses, so the screen can mark what *changed* rather than
  // only what is true. "This crossed last night" is the news; "this is still
  // overdue" is not, and telling them apart is what keeps the signal worth reading.
  const [previousRun] = await db
    .select({ runDate: forecasts.runDate })
    .from(forecasts)
    .where(and(eq(forecasts.shopId, shopId), sql`${forecasts.runDate} < ${runDate}::date`))
    .orderBy(desc(forecasts.runDate))
    .limit(1);

  const previousStatuses = new Map<string, ForecastStatus>();
  if (previousRun) {
    const prior = await db
      .select({ variantId: forecasts.variantId, status: forecasts.status })
      .from(forecasts)
      .where(and(eq(forecasts.shopId, shopId), eq(forecasts.runDate, previousRun.runDate)));
    for (const row of prior) previousStatuses.set(row.variantId, row.status);
  }

  const mapped: SkuRow[] = rows.map((row) => ({
    variantId: row.variantId,
    sku: row.sku,
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    displayTitle: displayTitle(row.productTitle, row.variantTitle),
    status: row.status,
    trend: row.trend,
    confidence: row.confidence,
    available: row.available,
    blendedVelocity: row.blendedVelocity,
    daysOfCover: row.daysOfCover,
    reorderPoint: row.reorderPoint,
    reorderQty: row.reorderQty,
    orderByDate: row.orderByDate,
    stockoutDate: row.stockoutDate,
    revenueAtRiskCents: row.revenueAtRiskCents,
    cashTiedUpCents: row.cashTiedUpCents,
    priceCents: row.priceCents,
    costCents: row.costCents,
    moq: row.moq,
    packSize: row.packSize,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    supplierEmail: row.supplierEmail,
    leadTimeDays: row.inputs.leadTimeDays ?? row.supplierLeadTimeDays ?? 14,
    snoozedUntil: row.snoozedUntil,
    inputs: row.inputs,
    previousStatus: previousStatuses.get(row.variantId) ?? null,
    crossedIntoOrderNow:
      row.status === "order_now" &&
      previousStatuses.has(row.variantId) &&
      previousStatuses.get(row.variantId) !== "order_now",
  }));

  mapped.sort(byUrgency);

  const totals = {
    revenueAtRiskCents: sum(mapped, (r) => r.revenueAtRiskCents),
    cashInDeadStockCents: sum(
      mapped.filter((r) => r.status === "dead"),
      (r) => r.cashTiedUpCents,
    ),
    orderNow: mapped.filter((r) => r.status === "order_now").length,
    orderSoon: mapped.filter((r) => r.status === "order_soon").length,
    healthy: mapped.filter((r) => r.status === "healthy").length,
    overstocked: mapped.filter((r) => r.status === "overstocked").length,
    dead: mapped.filter((r) => r.status === "dead").length,
    pastOrderBy: mapped.filter((r) => r.orderByDate !== null && r.orderByDate < runDate).length,
    dueThisWeek: mapped.filter(
      (r) =>
        r.orderByDate !== null &&
        r.orderByDate >= runDate &&
        r.orderByDate <= addDays(runDate, 7),
    ).length,
  };

  return { runDate, rows: mapped, totals };
}

export function displayTitle(productTitle: string, variantTitle: string): string {
  const variant = variantTitle.trim();
  if (!variant || variant.toLowerCase() === "default title" || variant === productTitle) {
    return productTitle;
  }
  return `${productTitle} · ${variant}`;
}

/** Closest to empty first; "never runs out" last. */
function byUrgency(a: SkuRow, b: SkuRow): number {
  const rank: Record<ForecastStatus, number> = {
    order_now: 0,
    order_soon: 1,
    healthy: 2,
    overstocked: 3,
    dead: 4,
  };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  const ac = a.daysOfCover ?? Number.POSITIVE_INFINITY;
  const bc = b.daysOfCover ?? Number.POSITIVE_INFINITY;
  if (ac !== bc) return ac - bc;
  return a.sku.localeCompare(b.sku);
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

/* ------------------------------------------------------------- SKU detail --- */

export interface RunwayPoint {
  date: string;
  /** Projected on-hand at the start of this day. */
  units: number;
}

export interface SkuDetail {
  row: SkuRow;
  runDate: string;
  /** Projected depletion from today to the stockout (or 45 days, whichever first). */
  runway: RunwayPoint[];
  /** Observed daily units over the last 30 days, for the sparkline strip. */
  recent: { date: string; units: number; stockout: boolean }[];
}

export async function skuDetail(shopId: string, variantId: string): Promise<SkuDetail | null> {
  const board = await reorderBoard(shopId);
  const row = board.rows.find((r) => r.variantId === variantId);
  if (!row || !board.runDate) return null;

  const db = getDb();
  const recentRows = await db
    .select({
      date: salesDaily.date,
      units: salesDaily.unitsSold,
      stockout: salesDaily.stockout,
    })
    .from(salesDaily)
    .where(
      and(
        eq(salesDaily.variantId, variantId),
        sql`${salesDaily.date} >= ${addDays(board.runDate, -30)}::date`,
        sql`${salesDaily.date} <= ${board.runDate}::date`,
      ),
    )
    .orderBy(salesDaily.date);

  return {
    row,
    runDate: board.runDate,
    runway: projectRunway(row, board.runDate),
    recent: recentRows,
  };
}

/**
 * The runway: on-hand projected forward at the blended velocity.
 *
 * Deliberately a straight line rather than a curve with a seasonality term. The
 * signature detail on this screen is a stock bar draining toward a date, and a
 * projection the merchant cannot reproduce with a calculator is a projection they
 * will not trust — which is the credibility problem the README names.
 */
export function projectRunway(row: SkuRow, from: string, maxDays = 45): RunwayPoint[] {
  const points: RunwayPoint[] = [];
  const velocity = row.blendedVelocity;
  const horizon = Math.min(
    maxDays,
    velocity > 0 ? Math.ceil(row.available / velocity) + 3 : maxDays,
  );
  for (let day = 0; day <= horizon; day++) {
    points.push({
      date: addDays(from, day),
      units: Math.max(0, Math.round(row.available - velocity * day)),
    });
  }
  return points;
}

/* ------------------------------------------------------------- dead stock --- */

export interface DeadStockRow {
  variantId: string;
  sku: string;
  displayTitle: string;
  units: number;
  daysOfCover: number | null;
  cashTiedUpCents: number;
  costMissing: boolean;
  trend: Trend;
  lastSaleOn: string | null;
  snoozedUntil: Date | null;
}

export interface DeadStockBoard {
  runDate: string | null;
  totalCents: number;
  rows: DeadStockRow[];
  snoozedCount: number;
}

/**
 * SKUs with too much cover and no momentum, ranked by cash tied up.
 *
 * Snoozed SKUs are excluded from the ranking and the total, and counted
 * separately — a merchant who has decided to sit on 200 totes until December does
 * not need to be told about them every month, but hiding the fact that they were
 * excluded would make the total look wrong.
 */
export async function deadStockBoard(shopId: string): Promise<DeadStockBoard> {
  const board = await reorderBoard(shopId);
  const now = new Date();
  const candidates = board.rows.filter((r) => r.status === "dead" || r.status === "overstocked");
  const snoozed = candidates.filter((r) => r.snoozedUntil !== null && r.snoozedUntil > now);
  const active = candidates.filter((r) => !(r.snoozedUntil !== null && r.snoozedUntil > now));

  const db = getDb();
  const lastSales = new Map<string, string>();
  if (active.length) {
    const rows = await db
      .select({
        variantId: salesDaily.variantId,
        last: sql<string | null>`max(${salesDaily.date})`,
      })
      .from(salesDaily)
      .where(
        and(
          inArray(
            salesDaily.variantId,
            active.map((r) => r.variantId),
          ),
          gt(salesDaily.unitsSold, 0),
        ),
      )
      .groupBy(salesDaily.variantId);
    for (const row of rows) if (row.last) lastSales.set(row.variantId, row.last);
  }

  const rows: DeadStockRow[] = active
    .map((row) => ({
      variantId: row.variantId,
      sku: row.sku,
      displayTitle: row.displayTitle,
      units: row.available,
      daysOfCover: row.daysOfCover,
      cashTiedUpCents: row.cashTiedUpCents,
      costMissing: row.costCents === null || row.costCents <= 0,
      trend: row.trend,
      lastSaleOn: lastSales.get(row.variantId) ?? null,
      snoozedUntil: row.snoozedUntil,
    }))
    .sort((a, b) => b.cashTiedUpCents - a.cashTiedUpCents || a.sku.localeCompare(b.sku));

  return {
    runDate: board.runDate,
    totalCents: rows.reduce((total, row) => total + row.cashTiedUpCents, 0),
    rows,
    snoozedCount: snoozed.length,
  };
}

/* ---------------------------------------------------------------- suppression --- */

/**
 * Variants currently suppressed by a sent or dismissed PO draft.
 *
 * Suppression is pinned to a fixed distance from the send (one lead time), never
 * to a condition that stays true — an open-ended suppression is how a SKU
 * disappears from the reorder list permanently.
 */
export async function suppressedVariantIds(shopId: string): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ variantId: poDraftLines.variantId })
    .from(poDraftLines)
    .innerJoin(poDrafts, eq(poDrafts.id, poDraftLines.poDraftId))
    .where(
      and(
        eq(poDrafts.shopId, shopId),
        sql`${poDrafts.suppressUntil} is not null`,
        sql`${poDrafts.suppressUntil} > now()`,
      ),
    );
  return new Set(rows.map((r) => r.variantId));
}

/** Open (draft) POs for a shop, with their lines. */
export async function openDrafts(shopId: string) {
  const db = getDb();
  const drafts = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.shopId, shopId), eq(poDrafts.status, "draft")))
    .orderBy(poDrafts.createdAt);
  if (!drafts.length) return [];

  const lines = await db
    .select()
    .from(poDraftLines)
    .where(
      inArray(
        poDraftLines.poDraftId,
        drafts.map((d) => d.id),
      ),
    )
    .orderBy(poDraftLines.sku);

  return drafts.map((draft) => ({
    draft,
    lines: lines.filter((line) => line.poDraftId === draft.id),
  }));
}

/** Sent and dismissed drafts, newest first — the hairline history rows. */
export async function draftHistory(shopId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.shopId, shopId), sql`${poDrafts.status} <> 'draft'`))
    .orderBy(desc(poDrafts.createdAt))
    .limit(limit);
}

/** Suppliers for a shop, with how many SKUs each covers. */
export async function supplierList(shopId: string) {
  const db = getDb();
  const rows = await db
    .select({
      supplier: suppliers,
      skuCount: sql<number>`count(${variants.id})::int`,
    })
    .from(suppliers)
    .leftJoin(variants, eq(variants.supplierId, suppliers.id))
    .where(eq(suppliers.shopId, shopId))
    .groupBy(suppliers.id)
    .orderBy(suppliers.name);
  return rows;
}

/** Variants with no supplier assigned — the data-readiness gap that matters most. */
export async function unassignedVariantCount(shopId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(variants)
    .where(
      and(eq(variants.shopId, shopId), eq(variants.tracked, true), isNull(variants.supplierId)),
    );
  return row?.n ?? 0;
}
