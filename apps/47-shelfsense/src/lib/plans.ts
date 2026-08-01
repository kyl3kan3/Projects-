/**
 * The plan catalogue and what each plan gates.
 *
 * Metered on tracked SKU count, which is the number the merchant can see in their
 * own catalogue — not orders or API calls, which they cannot predict. Going over
 * the cap never deletes data and never silently stops forecasting the whole shop:
 * SKUs beyond the cap stop being forecast in a defined order (least recently
 * selling first) and the app says so with an upgrade path. A merchant who imports
 * 400 SKUs onto Counter must not discover it by finding their dashboard empty.
 */

import type { Plan } from "@/db/schema";

export interface PlanDef {
  plan: Plan;
  name: string;
  priceCents: number;
  skuCap: number;
  locations: number;
  /** Supplier profiles, PO drafts and seasonality are Backroom and up. */
  suppliers: boolean;
  poDrafts: boolean;
  blurb: string;
  features: string[];
}

export const PLANS: Record<Plan, PlanDef> = {
  counter: {
    plan: "counter",
    name: "Counter",
    priceCents: 5900,
    skuCap: 250,
    locations: 1,
    suppliers: false,
    poDrafts: false,
    blurb: "Velocity, reorder points and dead stock for a focused catalogue.",
    features: [
      "Velocity + reorder points",
      "Stockout alerts",
      "Dead-stock report",
      "1 location",
    ],
  },
  backroom: {
    plan: "backroom",
    name: "Backroom",
    priceCents: 9900,
    skuCap: 1000,
    locations: 3,
    suppliers: true,
    poDrafts: true,
    blurb: "Supplier lead times and PO drafts — the plan most stores stay on.",
    features: [
      "Everything in Counter",
      "Supplier profiles & lead times",
      "PO drafts (CSV or email)",
      "Seasonality-aware forecasts",
      "3 locations",
    ],
  },
  warehouse: {
    plan: "warehouse",
    name: "Warehouse",
    priceCents: 19900,
    skuCap: 5000,
    locations: 10,
    suppliers: true,
    poDrafts: true,
    blurb: "For catalogues past a thousand SKUs and multiple stockrooms.",
    features: [
      "Everything in Backroom",
      "Up to 5,000 SKUs",
      "PO push with supplier portal links",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: Plan[] = ["counter", "backroom", "warehouse"];

export function plan(id: Plan): PlanDef {
  return PLANS[id] ?? PLANS.counter;
}

/** The cheapest plan that fits a given SKU count, or null if nothing does. */
export function planForSkuCount(count: number): PlanDef | null {
  return PLAN_ORDER.map(plan).find((p) => count <= p.skuCap) ?? null;
}

export interface CapState {
  cap: number;
  used: number;
  over: number;
  overCap: boolean;
  /** The plan to upsell to, or null when they are already on the largest. */
  upgradeTo: PlanDef | null;
}

export function capState(planId: Plan, trackedSkus: number): CapState {
  const current = plan(planId);
  const over = Math.max(0, trackedSkus - current.skuCap);
  const upgrade = over > 0 ? planForSkuCount(trackedSkus) : null;
  return {
    cap: current.skuCap,
    used: trackedSkus,
    over,
    overCap: over > 0,
    upgradeTo: upgrade && upgrade.plan !== planId ? upgrade : null,
  };
}

/**
 * What a shop can actually do right now.
 *
 * During the 14-day trial every store gets Backroom, because the trial has to
 * show the thing the product is for: a merchant who cannot draft a PO in the trial
 * has not seen ShelfSense, they have seen a report. After the trial the plan is the
 * plan.
 */
export function entitlementsFor(planId: Plan, trialIsActive: boolean): PlanDef {
  const current = plan(planId);
  if (!trialIsActive) return current;
  return current.priceCents >= PLANS.backroom.priceCents ? current : PLANS.backroom;
}

export const TRIAL_DAYS = 14;
