/**
 * Plan catalog — the single source of truth for tiers, limits and gates.
 * Mirrors the pricing table in README.md exactly. Prices here are display-only;
 * the billable Stripe price IDs live in env.
 *
 * The free-tier badge is modelled as a *limit*, not a preference: README calls
 * it the acquisition engine, so `canHideBadge` is false on free and the settings
 * toggle is disabled rather than hidden — the founder should see what upgrading
 * buys.
 */

import type { PlanId } from "@/db/schema";

/** Sentinel for "unlimited"; kept finite so arithmetic never meets Infinity. */
export const UNLIMITED = 1_000_000_000;

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  /** Signups per list before the form starts refusing new ones. */
  signupsPerList: number;
  lists: number;
  canHideBadge: boolean;
  customDomain: boolean;
  emailBlasts: boolean;
  webhooks: boolean;
  csvExport: boolean;
  abTests: boolean;
  /** Blast recipients per calendar month — the only real variable cost. */
  monthlyEmailQuota: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    signupsPerList: 250,
    lists: 1,
    canHideBadge: false,
    customDomain: false,
    emailBlasts: false,
    webhooks: false,
    csvExport: true,
    abTests: false,
    monthlyEmailQuota: 0,
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 19,
    signupsPerList: 5_000,
    lists: 5,
    canHideBadge: true,
    customDomain: true,
    emailBlasts: true,
    webhooks: false,
    csvExport: true,
    abTests: false,
    monthlyEmailQuota: 20_000,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 49,
    signupsPerList: UNLIMITED,
    lists: UNLIMITED,
    canHideBadge: true,
    customDomain: true,
    emailBlasts: true,
    webhooks: true,
    csvExport: true,
    abTests: true,
    monthlyEmailQuota: 200_000,
  },
};

export const PAID_PLANS: PlanId[] = ["growth", "pro"];

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.free;
}

export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED;
}

/** Display helper: "5,000" or "Unlimited". */
export function limitLabel(n: number): string {
  return isUnlimited(n) ? "Unlimited" : n.toLocaleString("en-US");
}

export interface CapacityCheck {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  reason?: string;
}

/**
 * Can this list take another signup?
 *
 * Over the cap the *page* stops accepting, and says so honestly. Existing
 * signups are never touched — a founder whose card expired must not lose the
 * list they built.
 */
export function signupCapacity(planId: PlanId, used: number): CapacityCheck {
  const limit = plan(planId).signupsPerList;
  const remaining = Math.max(0, limit - used);
  if (remaining > 0) return { allowed: true, used, limit, remaining };
  return {
    allowed: false,
    used,
    limit,
    remaining: 0,
    reason: `This list has reached the ${plan(planId).name} plan's limit of ${limitLabel(limit)} signups.`,
  };
}

export function listCapacity(planId: PlanId, used: number): CapacityCheck {
  const limit = plan(planId).lists;
  const remaining = Math.max(0, limit - used);
  if (remaining > 0) return { allowed: true, used, limit, remaining };
  return {
    allowed: false,
    used,
    limit,
    remaining: 0,
    reason: `${plan(planId).name} includes ${limitLabel(limit)} list${limit === 1 ? "" : "s"}. Upgrade to run more launches at once.`,
  };
}

export type Feature = "canHideBadge" | "customDomain" | "emailBlasts" | "webhooks" | "csvExport" | "abTests";

export function featureAllowed(planId: PlanId, feature: Feature): boolean {
  return plan(planId)[feature];
}

/** The cheapest plan that includes a feature — used to word the upgrade nudge. */
export function cheapestPlanWith(feature: Feature): Plan | null {
  const ladder: PlanId[] = ["free", "growth", "pro"];
  for (const id of ladder) {
    if (plan(id)[feature]) return plan(id);
  }
  return null;
}

/** Resolve which plan a Stripe price ID corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { growth: string; pro: string },
): PlanId {
  if (priceId && priceId === prices.pro) return "pro";
  if (priceId && priceId === prices.growth) return "growth";
  return "free";
}
