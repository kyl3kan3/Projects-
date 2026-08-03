/**
 * Plan catalog — the single source of truth for tiers, limits and gates.
 * Mirrors the pricing table in README.md. Prices are display-only; the billable
 * Stripe price ids live in env.
 *
 * Flat pricing is the positioning line ("never a % of spend"), so nothing here
 * is derived from the customer's cloud bill — deliberately.
 *
 * Post-MVP columns from the README table (GCP, API access, SSO, custom alert
 * rules) are carried so the pricing ladder can be shown honestly, but nothing
 * meters them yet; they are Phase 3 in ROADMAP.md.
 */

import type { PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  /** Connected AWS accounts. */
  accounts: number;
  /** Hourly chart resolution and hourly anomaly evaluation. Solo is daily. */
  hourlyGranularity: boolean;
  deployCorrelation: boolean;
  budgets: boolean;
  /** Post-MVP, shown but unmetered. */
  gcp: boolean;
  apiAccess: boolean;
  sso: boolean;
  customAlertRules: boolean;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  solo: {
    id: "solo",
    name: "Solo",
    priceMonthly: 49,
    accounts: 1,
    hourlyGranularity: false,
    deployCorrelation: false,
    budgets: false,
    gcp: false,
    apiAccess: false,
    sso: false,
    customAlertRules: false,
    blurb: "One AWS account, daily digest and anomaly alerts.",
  },
  startup: {
    id: "startup",
    name: "Startup",
    priceMonthly: 99,
    accounts: 5,
    hourlyGranularity: true,
    deployCorrelation: true,
    budgets: true,
    gcp: false,
    apiAccess: false,
    sso: false,
    customAlertRules: false,
    blurb: "Five accounts, hourly granularity, deploy correlation, budgets.",
  },
  scale: {
    id: "scale",
    name: "Scale",
    priceMonthly: 199,
    accounts: 15,
    hourlyGranularity: true,
    deployCorrelation: true,
    budgets: true,
    gcp: true,
    apiAccess: true,
    sso: true,
    customAlertRules: true,
    blurb: "Fifteen accounts, GCP, API, custom alert rules, SSO.",
  },
};

export const PLAN_ORDER: PlanId[] = ["solo", "startup", "scale"];

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.solo;
}

/** Can this org connect one more AWS account? */
export function canAddAccount(planId: PlanId, currentCount: number): boolean {
  return currentCount < plan(planId).accounts;
}

/** The message shown when the account limit is hit — names the next tier up. */
export function accountLimitMessage(planId: PlanId): string {
  const current = plan(planId);
  const next = PLAN_ORDER[PLAN_ORDER.indexOf(planId) + 1];
  const suffix = next
    ? ` ${PLANS[next].name} covers ${PLANS[next].accounts}.`
    : " Contact us for more.";
  return `${current.name} covers ${current.accounts} AWS account${
    current.accounts === 1 ? "" : "s"
  }.${suffix}`;
}

/** Chart and evaluation resolution the plan allows. */
export function granularity(planId: PlanId): "hour" | "day" {
  return plan(planId).hourlyGranularity ? "hour" : "day";
}

/** Resolve which plan a Stripe price id corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { solo: string; startup: string; scale: string },
): PlanId {
  if (priceId && priceId === prices.scale) return "scale";
  if (priceId && priceId === prices.startup) return "startup";
  return "solo";
}
