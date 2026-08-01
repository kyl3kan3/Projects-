/**
 * The reorder engine: velocity + lead time -> reorder point, order-by date,
 * suggested quantity, revenue at risk, and status. Pure planning logic; the
 * persistence lives in `lib/forecast-run.ts`.
 *
 * The definitions, once, because every number on screen expands to them:
 *
 *   reorder point   = ceil(velocity x (lead time + safety days))
 *   days of cover   = available / velocity          (null if velocity is 0)
 *   stockout date   = asOf + floor(available / velocity)
 *   order-by date   = the day on-hand falls to the reorder point
 *                   = asOf + floor((available - reorder point) / velocity)
 *                   = stockout date - lead time - safety days
 *
 * Order-by is derived from the reorder point rather than from a plain
 * stockout-minus-lead-time on purpose. Subtracting only the lead time makes the replenishment
 * land exactly as the shelf empties, which is a coin flip on whether the SKU goes
 * dark — and it makes the safety days a number the app displays but never uses.
 *
 * Getting this wrong is expensive in both directions, so two things are deliberate:
 * a reorder point is rounded **up** (never suggest a fraction of a unit of
 * safety), and a suggested quantity is rounded up to MOQ and then to pack size,
 * never down — a PO that violates the supplier's minimum is a PO the supplier
 * rejects.
 */

import type { Confidence, ForecastStatus, Trend } from "@/db/schema";
import { addDays } from "@/lib/dates";

export interface ReorderThresholds {
  orderSoonDays: number;
  overstockCoverDays: number;
  deadCoverDays: number;
  riskHorizonDays: number;
}

export interface ReorderInput {
  asOf: string;
  /** Blended units/day from lib/velocity. */
  velocity: number;
  available: number;
  leadTimeDays: number;
  safetyDays: number;
  coverTargetDays: number;
  moq: number;
  packSize: number;
  priceCents: number;
  costCents: number | null;
  trend: Trend;
  confidence: Confidence;
  /** Observed (non-stockout) days behind the velocity figure. */
  observedDays: number;
  /** True when every velocity window was censored by stockouts. */
  demandCensored: boolean;
  /** Whether this variant has ever sold a unit, at any point on record. */
  hasSalesHistory: boolean;
  thresholds: ReorderThresholds;
}

export interface ReorderSuggestion {
  reorderPoint: number;
  suggestedQty: number;
  /** Null when velocity is zero: there is no date at which it runs out. */
  stockoutDate: string | null;
  orderByDate: string | null;
  daysOfCover: number | null;
  revenueAtRiskCents: number;
  cashTiedUpCents: number;
  costMissing: boolean;
  status: ForecastStatus;
  notes: string[];
}

/** Enough observed history before a silent SKU may be called dead. */
const MIN_DAYS_TO_CALL_DEAD = 30;

/* ------------------------------------------------------------ primitives --- */

export function reorderPoint(
  blendedVelocity: number,
  leadTimeDays: number,
  safetyDays: number,
): number {
  if (!(blendedVelocity > 0)) return 0;
  const days = Math.max(0, leadTimeDays) + Math.max(0, safetyDays);
  return Math.ceil(blendedVelocity * days);
}

/** Null means "does not run out at the current rate" — not zero, not Infinity. */
export function daysOfCover(available: number, blendedVelocity: number): number | null {
  if (!(blendedVelocity > 0)) return null;
  return Math.max(0, available) / blendedVelocity;
}

export function stockoutDate(
  available: number,
  blendedVelocity: number,
  asOf: string,
): string | null {
  const cover = daysOfCover(available, blendedVelocity);
  if (cover === null) return null;
  return addDays(asOf, Math.floor(cover));
}

/**
 * The day on-hand reaches the reorder point. Returns a date in the past when the
 * SKU is already below it — the dashboard needs to say "past due", not "today".
 */
export function orderByDate(
  available: number,
  blendedVelocity: number,
  leadTimeDays: number,
  safetyDays: number,
  asOf: string,
): string | null {
  if (!(blendedVelocity > 0)) return null;
  const rop = reorderPoint(blendedVelocity, leadTimeDays, safetyDays);
  const days = (Math.max(0, available) - rop) / blendedVelocity;
  // Clamped so a SKU with a year of stale history cannot produce a date outside
  // the range Postgres will store.
  return addDays(asOf, Math.max(-3650, Math.min(3650, Math.floor(days))));
}

/**
 * Round a raw need up to something the supplier will actually accept: at least
 * the MOQ, and a whole number of packs. Never rounds down.
 *
 * MOQ 100 with pack size 24 and a need of 130 gives 144 — 130 clears the MOQ, and
 * 144 is the first multiple of 24 at or above it. A need of 50 against the same
 * supplier gives 120, because 100 (the MOQ) is not a whole number of packs.
 */
export function roundToOrderable(need: number, moq: number, packSize: number): number {
  if (!(need > 0)) return 0;
  const pack = Math.max(1, Math.floor(packSize || 1));
  const floorQty = Math.max(Math.ceil(need), Math.max(0, Math.floor(moq || 0)));
  return Math.ceil(floorQty / pack) * pack;
}

/**
 * How many units to put on the PO: enough that stock at arrival covers lead time,
 * safety, and the cover target, less what is already on the shelf.
 */
export function suggestedQty(input: {
  velocity: number;
  leadTimeDays: number;
  safetyDays: number;
  coverTargetDays: number;
  available: number;
  moq: number;
  packSize: number;
}): number {
  const { velocity, leadTimeDays, safetyDays, coverTargetDays, available, moq, packSize } = input;
  if (!(velocity > 0)) return 0;
  const targetUnits = Math.ceil(
    velocity *
      (Math.max(0, leadTimeDays) + Math.max(0, safetyDays) + Math.max(0, coverTargetDays)),
  );
  const need = targetUnits - Math.max(0, available);
  return roundToOrderable(need, moq, packSize);
}

/**
 * Projected sales lost to being out of stock, in cents, assuming the merchant
 * orders **today**.
 *
 * Stock runs out at `stockoutDate`; a PO placed now arrives in `leadTimeDays`. The
 * gap between those two is the dark window, and it is the only thing at risk —
 * which is why a SKU that still has more cover than its lead time returns exactly
 * zero rather than a small scary number. The window is capped at the horizon so
 * the headline means "in the next 30 days", and the result is integer cents so the
 * dashboard total equals the sum of its drill-downs to the cent.
 */
export function revenueAtRiskCents(input: {
  available: number;
  velocity: number;
  leadTimeDays: number;
  priceCents: number;
  horizonDays: number;
}): number {
  const { available, velocity, leadTimeDays, priceCents, horizonDays } = input;
  if (!(velocity > 0) || priceCents <= 0 || horizonDays <= 0) return 0;
  const daysToStockout = Math.max(0, available) / velocity;
  const replenishAt = Math.min(Math.max(0, leadTimeDays), horizonDays);
  const darkDays = Math.max(0, replenishAt - daysToStockout);
  if (darkDays <= 0) return 0;
  return Math.round(darkDays * velocity * priceCents);
}

/**
 * Cash sitting on the shelf. Cost price when the merchant has entered one;
 * otherwise half the retail price, flagged so the UI can say the number is an
 * estimate rather than quietly presenting a guess as a fact.
 */
export function cashTiedUp(
  available: number,
  costCents: number | null,
  priceCents: number,
): { cents: number; costMissing: boolean } {
  const units = Math.max(0, available);
  if (costCents !== null && costCents > 0) {
    return { cents: units * costCents, costMissing: false };
  }
  return { cents: Math.round(units * priceCents * 0.5), costMissing: true };
}

/* --------------------------------------------------------------- statuses --- */

/**
 * Which bucket a SKU falls in.
 *
 * The order of these tests is the product. In particular: a SKU that is out of
 * stock and has sold before is `order_now` even when its measured velocity is
 * zero, because a zero measured while empty is not evidence of no demand. That is
 * the difference between "reorder your best-seller" and "write off your
 * best-seller".
 */
export function statusFor(input: {
  available: number;
  velocity: number;
  daysOfCover: number | null;
  orderByDate: string | null;
  asOf: string;
  trend: Trend;
  observedDays: number;
  demandCensored: boolean;
  hasSalesHistory: boolean;
  thresholds: ReorderThresholds;
}): { status: ForecastStatus; notes: string[] } {
  const notes: string[] = [];
  const { thresholds } = input;

  // Out of stock with a history of selling: urgent, whatever the arithmetic says.
  if (input.available <= 0 && input.hasSalesHistory) {
    notes.push("Out of stock — every day from here is a day of lost sales.");
    if (input.demandCensored) {
      notes.push(
        "Demand could not be measured: the variant was out of stock for the whole window, so its rate is an estimate from earlier history.",
      );
    }
    return { status: "order_now", notes };
  }

  if (input.demandCensored) {
    notes.push(
      "No in-stock day in the last 90 days — velocity is unknown rather than zero, so no reorder point is claimed.",
    );
    return { status: "healthy", notes };
  }

  if (!(input.velocity > 0)) {
    if (input.available <= 0) {
      notes.push("No stock and no recorded sales — nothing to forecast yet.");
      return { status: "healthy", notes };
    }
    if (input.observedDays >= MIN_DAYS_TO_CALL_DEAD) {
      notes.push(
        `In stock for ${input.observedDays} observed days with no sales — this is cash on a shelf, not a supply problem.`,
      );
      return { status: "dead", notes };
    }
    notes.push(
      `Only ${input.observedDays} observed days of history — too early to call this dead.`,
    );
    return { status: "healthy", notes };
  }

  const cover = input.daysOfCover;
  const orderBy = input.orderByDate;

  if (orderBy) {
    if (orderBy <= input.asOf) {
      notes.push(
        orderBy < input.asOf
          ? `Order-by date passed on ${orderBy} — the shelf reaches its reorder point before a new PO could land.`
          : "Order-by date is today.",
      );
      return { status: "order_now", notes };
    }
    if (orderBy <= addDays(input.asOf, thresholds.orderSoonDays)) {
      notes.push(`Reorder point is reached on ${orderBy}.`);
      return { status: "order_soon", notes };
    }
  }

  if (cover !== null && cover > thresholds.deadCoverDays && input.trend !== "rising") {
    notes.push(
      `${Math.round(cover)} days of cover at the current rate — beyond the ${thresholds.deadCoverDays}-day dead-stock threshold.`,
    );
    return { status: "dead", notes };
  }

  if (cover !== null && cover > thresholds.overstockCoverDays) {
    notes.push(
      `${Math.round(cover)} days of cover — more than the ${thresholds.overstockCoverDays}-day overstock threshold, but still selling.`,
    );
    return { status: "overstocked", notes };
  }

  return { status: "healthy", notes };
}

/* ------------------------------------------------------------------ plan --- */

/** Everything the nightly run persists for one variant. */
export function planReorder(input: ReorderInput): ReorderSuggestion {
  const rop = reorderPoint(input.velocity, input.leadTimeDays, input.safetyDays);
  const cover = daysOfCover(input.available, input.velocity);
  const stockout = stockoutDate(input.available, input.velocity, input.asOf);
  const orderBy = orderByDate(
    input.available,
    input.velocity,
    input.leadTimeDays,
    input.safetyDays,
    input.asOf,
  );

  const { status, notes } = statusFor({
    available: input.available,
    velocity: input.velocity,
    daysOfCover: cover,
    orderByDate: orderBy,
    asOf: input.asOf,
    trend: input.trend,
    observedDays: input.observedDays,
    demandCensored: input.demandCensored,
    hasSalesHistory: input.hasSalesHistory,
    thresholds: input.thresholds,
  });

  const qty =
    status === "order_now" || status === "order_soon"
      ? suggestedQty({
          velocity: input.velocity,
          leadTimeDays: input.leadTimeDays,
          safetyDays: input.safetyDays,
          coverTargetDays: input.coverTargetDays,
          available: input.available,
          moq: input.moq,
          packSize: input.packSize,
        })
      : 0;

  const risk =
    status === "order_now" || status === "order_soon"
      ? revenueAtRiskCents({
          available: input.available,
          velocity: input.velocity,
          leadTimeDays: input.leadTimeDays,
          priceCents: input.priceCents,
          horizonDays: input.thresholds.riskHorizonDays,
        })
      : 0;

  const cash = cashTiedUp(input.available, input.costCents, input.priceCents);

  if (input.confidence === "low") {
    notes.push(
      "Low confidence: short history or volatile daily sales. Treat the quantity as a starting point.",
    );
  }
  if (cash.costMissing && input.available > 0) {
    notes.push("No unit cost on file — cash tied up is estimated at half the retail price.");
  }

  return {
    reorderPoint: rop,
    suggestedQty: qty,
    stockoutDate: stockout,
    orderByDate: orderBy,
    daysOfCover: cover,
    revenueAtRiskCents: risk,
    cashTiedUpCents: cash.cents,
    costMissing: cash.costMissing,
    status,
    notes,
  };
}
