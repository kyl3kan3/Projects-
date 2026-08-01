/**
 * The plan catalog — one source of truth for tiers, limits and gates. Mirrors
 * the pricing table in README.md; the billable Stripe price ids live in env.
 *
 * The Free tier's 30-trades-a-month cap is the product's conversion moment, so
 * it is enforced at the one place where trades come into existence — the import
 * — and enforced *before* anything is written. An import that would cross the
 * cap is refused in full, with the exact numbers, rather than partially applied:
 * a half-imported file leaves executions the matcher cannot close, and a journal
 * showing a position that never exits is worse than a wall with a price on it.
 */

import type { PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  /** Brokerage accounts that can be connected. */
  accounts: number;
  /** Trades that may be created per calendar month; Infinity for paid tiers. */
  tradesPerMonth: number;
  /** Segment analytics: time of day, weekday, hold time, symbol. */
  segmentAnalytics: boolean;
  /** How many leak findings are readable; Free sees the top one. */
  findingsVisible: number;
  setups: boolean;
  chartImages: boolean;
  /** CSV/JSON export of the journal. */
  dataExport: boolean;
  /**
   * Read-only share link for a mentor or prop firm. ROADMAP phase 3 — the flag
   * exists so the gate is ready, and it is false everywhere so no surface
   * advertises a feature that is not built.
   */
  mentorSharing: boolean;
  /** The one-line reason to move up a tier. */
  pitch: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    accounts: 1,
    tradesPerMonth: 30,
    segmentAnalytics: false,
    findingsVisible: 1,
    setups: false,
    chartImages: false,
    dataExport: false,
    mentorSharing: false,
    pitch: "One account, 30 trades a month, the core numbers and your biggest leak.",
  },
  trader: {
    id: "trader",
    name: "Trader",
    priceMonthly: 19,
    priceYearly: 190,
    accounts: 1,
    tradesPerMonth: Number.POSITIVE_INFINITY,
    segmentAnalytics: true,
    findingsVisible: Number.POSITIVE_INFINITY,
    setups: true,
    chartImages: true,
    dataExport: false,
    mentorSharing: false,
    pitch: "Every trade, every leak, your own playbook with its expectancy.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 49,
    priceYearly: 490,
    accounts: 10,
    tradesPerMonth: Number.POSITIVE_INFINITY,
    segmentAnalytics: true,
    findingsVisible: Number.POSITIVE_INFINITY,
    setups: true,
    chartImages: true,
    dataExport: true,
    mentorSharing: false,
    pitch: "Several brokerage accounts, and your whole journal exportable as CSV.",
  },
};

export const PAID_PLANS: PlanId[] = ["trader", "pro"];
export type BillingInterval = "month" | "year";

export function plan(id: PlanId | string | null | undefined): Plan {
  return PLANS[(id ?? "free") as PlanId] ?? PLANS.free;
}

export function priceFor(planId: PlanId, interval: BillingInterval): number {
  const p = plan(planId);
  return interval === "year" ? p.priceYearly : p.priceMonthly;
}

/** What a year costs per month, for the "two months free" line. */
export function monthlyEquivalent(planId: PlanId): number {
  const yearly = plan(planId).priceYearly;
  return yearly === 0 ? 0 : Math.round((yearly / 12) * 100) / 100;
}

export interface TradeCapCheck {
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  /** How many the import wanted to create. */
  requested: number;
  message: string | null;
}

/**
 * Would importing `requested` new trades stay inside the plan's monthly cap?
 * `used` is the count of trades already created this calendar month.
 */
export function checkTradeCap(
  planId: PlanId,
  used: number,
  requested: number,
): TradeCapCheck {
  const limit = plan(planId).tradesPerMonth;
  if (!Number.isFinite(limit)) {
    return { allowed: true, limit, used, remaining: Infinity, requested, message: null };
  }
  const remaining = Math.max(0, limit - used);
  if (requested <= remaining) {
    return { allowed: true, limit, used, remaining, requested, message: null };
  }
  const noun = requested === 1 ? "trade" : "trades";
  return {
    allowed: false,
    limit,
    used,
    remaining,
    requested,
    message:
      remaining === 0
        ? `This file matches ${requested} ${noun}, and you have used all ${limit} of this month's on the ${plan(planId).name} plan. Trader is unlimited at $${PLANS.trader.priceMonthly}/mo.`
        : `This file matches ${requested} ${noun} and you have ${remaining} left this month on ${plan(planId).name}. Import a shorter date range, or go unlimited on Trader at $${PLANS.trader.priceMonthly}/mo.`,
  };
}

export function accountLimitReached(planId: PlanId, current: number): boolean {
  return current >= plan(planId).accounts;
}

/** How many findings this plan may read, given how many were detected. */
export function visibleFindings(planId: PlanId, detected: number): number {
  const allowed = plan(planId).findingsVisible;
  return Number.isFinite(allowed) ? Math.min(detected, allowed) : detected;
}

/** Resolve which plan and interval a Stripe price id corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: {
    traderMonthly: string;
    traderYearly: string;
    proMonthly: string;
    proYearly: string;
  },
): { plan: PlanId; interval: BillingInterval | null } {
  if (!priceId) return { plan: "free", interval: null };
  if (priceId === prices.proMonthly) return { plan: "pro", interval: "month" };
  if (priceId === prices.proYearly) return { plan: "pro", interval: "year" };
  if (priceId === prices.traderMonthly) return { plan: "trader", interval: "month" };
  if (priceId === prices.traderYearly) return { plan: "trader", interval: "year" };
  return { plan: "free", interval: null };
}
