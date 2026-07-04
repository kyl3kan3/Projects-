/**
 * src/lib/reorder.ts
 *
 * Reorder-point engine: turns velocity + supplier lead time into reorder
 * points, order-by dates, and stockout revenue-at-risk. Pure planning
 * logic -- persistence happens in the worker.
 *
 * TODO:
 * - [ ] reorderPoint(blendedVelocity, leadTimeDays, safetyDays): units.
 * - [ ] daysOfCover(available, blendedVelocity): with Infinity guard for
 *       zero-velocity SKUs (those route to dead-stock logic instead).
 * - [ ] stockoutDate(available, blendedVelocity, today): projected date
 *       inventory hits zero.
 * - [ ] orderByDate(stockoutDate, leadTimeDays): the headline date; past
 *       due => status "order_now".
 * - [ ] suggestedQty(velocity, coverTargetDays, moq, packSize): round up
 *       to MOQ then to pack size -- never down.
 * - [ ] revenueAtRisk(variant, forecast, horizonDays): projected missed
 *       units x price over the uncovered window; 0 when covered.
 * - [ ] statusFor(forecast, thresholds): order_now | order_soon | healthy |
 *       overstocked | dead (thresholds from shop settings).
 */

import type { ForecastInputs, ForecastStatus } from "../db/schema";

export interface ReorderSuggestion {
  reorderPoint: number;
  suggestedQty: number;
  orderByDate: Date;
  stockoutDate: Date | null;
  revenueAtRiskCents: number;
  status: ForecastStatus;
  inputs: ForecastInputs;
}

export function reorderPoint(
  _blendedVelocity: number,
  _leadTimeDays: number,
  _safetyDays: number,
): number {
  throw new Error("Not implemented");
}

export function suggestedQty(
  _velocity: number,
  _coverTargetDays: number,
  _moq: number,
  _packSize: number,
): number {
  throw new Error("Not implemented");
}
