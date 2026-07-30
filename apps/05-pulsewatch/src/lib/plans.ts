/**
 * Plan catalog — the single source of truth for tiers, limits, and gates.
 * Mirrors the pricing table in README.md. Prices are display-only; billable
 * Stripe price IDs live in env.
 *
 * Post-MVP columns from the README table (SMS credits, team seats > 1) are
 * carried here so the UI can show the ladder honestly, but nothing meters them
 * yet — SMS is explicitly out of MVP scope.
 */

import type { PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  monitors: number;
  minIntervalSeconds: number;
  regionsPerCheck: number;
  statusPages: number;
  customDomain: boolean;
  channels: readonly ("email" | "webhook" | "slack" | "discord" | "sms")[];
  smsCredits: number;
  seats: number;
  retentionDays: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    monitors: 3,
    minIntervalSeconds: 300,
    regionsPerCheck: 1,
    statusPages: 1,
    customDomain: false,
    channels: ["email", "webhook"],
    smsCredits: 0,
    seats: 1,
    retentionDays: 30,
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceMonthly: 9,
    monitors: 25,
    minIntervalSeconds: 60,
    regionsPerCheck: 3,
    statusPages: 3,
    customDomain: false,
    channels: ["email", "webhook", "slack", "discord"],
    smsCredits: 0,
    seats: 1,
    retentionDays: 365,
  },
  team: {
    id: "team",
    name: "Team",
    priceMonthly: 19,
    monitors: 100,
    minIntervalSeconds: 60,
    regionsPerCheck: 3,
    statusPages: 10,
    customDomain: true,
    channels: ["email", "webhook", "slack", "discord", "sms"],
    smsCredits: 100,
    seats: 10,
    retentionDays: 730,
  },
};

export const PAID_PLANS: PlanId[] = ["solo", "team"];

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.free;
}

/** Clamp a requested interval up to whatever the plan actually allows. */
export function allowedInterval(planId: PlanId, requestedSeconds: number): number {
  return Math.max(plan(planId).minIntervalSeconds, requestedSeconds);
}

/** Trim a region list down to the plan's fan-out. */
export function allowedRegions(planId: PlanId, requested: string[], available: string[]): string[] {
  const max = plan(planId).regionsPerCheck;
  const valid = requested.filter((r) => available.includes(r));
  const chosen = valid.length ? valid : available.slice(0, 1);
  return chosen.slice(0, max);
}

export function channelAllowed(planId: PlanId, kind: Plan["channels"][number]): boolean {
  return plan(planId).channels.includes(kind);
}

/** Resolve which plan a Stripe price ID corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { solo: string; team: string },
): PlanId {
  if (priceId && priceId === prices.team) return "team";
  if (priceId && priceId === prices.solo) return "solo";
  return "free";
}
