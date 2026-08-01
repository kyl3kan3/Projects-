/**
 * Plan catalog — the single source of truth for tiers, limits, and gates.
 * Mirrors the pricing table in README.md exactly. Prices are display-only;
 * billable Stripe price IDs live in env.
 *
 * Post-MVP columns from that table (Slack alerts, team seats above one) are
 * carried here so the ladder can be shown honestly, but nothing meters them
 * yet — README defers Slack past MVP.
 */

import type { DrillFrequency, Frequency, PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  /** Infinity on Business — "Unlimited" in the pricing table. */
  databases: number;
  /** The fastest schedule this plan may run. */
  maxFrequency: Frequency;
  retentionDays: number;
  /** The most frequent drill cadence this plan may run. */
  maxDrill: DrillFrequency;
  byoBucket: boolean;
  complianceReport: boolean;
  slackAlerts: boolean;
  seats: number;
}

export const PLANS: Record<PlanId, Plan> = {
  hobby: {
    id: "hobby",
    name: "Hobby",
    priceMonthly: 15,
    databases: 1,
    maxFrequency: "daily",
    retentionDays: 30,
    maxDrill: "none",
    byoBucket: true,
    complianceReport: false,
    slackAlerts: false,
    seats: 1,
  },
  startup: {
    id: "startup",
    name: "Startup",
    priceMonthly: 29,
    databases: 5,
    maxFrequency: "hourly",
    retentionDays: 90,
    maxDrill: "monthly",
    byoBucket: true,
    complianceReport: false,
    slackAlerts: false,
    seats: 3,
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthly: 49,
    databases: Number.POSITIVE_INFINITY,
    maxFrequency: "hourly",
    retentionDays: 365,
    maxDrill: "weekly",
    byoBucket: true,
    complianceReport: true,
    slackAlerts: true,
    seats: Number.POSITIVE_INFINITY,
  },
};

export const PLAN_ORDER: PlanId[] = ["hobby", "startup", "business"];

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.hobby;
}

export function databasesLabel(p: Plan): string {
  return Number.isFinite(p.databases) ? String(p.databases) : "Unlimited";
}

/** Can this plan add another database? */
export function canAddDatabase(planId: PlanId, current: number): boolean {
  return current < plan(planId).databases;
}

/** Clamp a requested frequency down to what the plan allows. */
export function allowedFrequency(planId: PlanId, requested: Frequency): Frequency {
  if (requested === "hourly" && plan(planId).maxFrequency === "daily") return "daily";
  return requested;
}

/** Clamp a retention window to the plan ceiling, and to a sane floor. */
export function allowedRetentionDays(planId: PlanId, requested: number): number {
  const max = plan(planId).retentionDays;
  if (!Number.isFinite(requested) || requested < 1) return Math.min(7, max);
  return Math.min(Math.floor(requested), max);
}

const DRILL_RANK: Record<DrillFrequency, number> = { none: 0, monthly: 1, weekly: 2 };

/** Clamp a drill cadence to the plan's ceiling. Hobby gets none. */
export function allowedDrillFrequency(planId: PlanId, requested: DrillFrequency): DrillFrequency {
  const ceiling = plan(planId).maxDrill;
  return DRILL_RANK[requested] > DRILL_RANK[ceiling] ? ceiling : requested;
}

/** Resolve which plan a Stripe price ID corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { hobby: string; startup: string; business: string },
): PlanId {
  if (priceId && priceId === prices.business) return "business";
  if (priceId && priceId === prices.startup) return "startup";
  if (priceId && priceId === prices.hobby) return "hobby";
  // Unknown price: fall back to the entry tier rather than granting the top one.
  return "hobby";
}
