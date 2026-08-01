/**
 * The plan catalog — one source of truth for the three tiers in README.md.
 *
 * The meter is **units**, not seats: that is what a 1–20-unit landlord
 * understands and what the pricing table promises. Gating is checked when a unit
 * is created, and a downgrade never deletes anything (see `overflowUnits`).
 */

import type { Plan as PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  units: number;
  collaborators: number;
  /** Lease e-sign included in the plan, per the pricing table. */
  eSign: boolean;
  lateFeeAutomation: boolean;
  documentVault: boolean;
  multiPropertyDashboard: boolean;
  exportableLedgers: boolean;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  keys: {
    id: "keys",
    name: "Keys",
    priceMonthly: 19,
    units: 3,
    collaborators: 1,
    eSign: false,
    lateFeeAutomation: false,
    documentVault: false,
    multiPropertyDashboard: false,
    exportableLedgers: false,
    blurb: "Listings, applications, screening records, rent ledger and reminders for up to 3 units.",
  },
  building: {
    id: "building",
    name: "Building",
    priceMonthly: 39,
    units: 10,
    collaborators: 2,
    eSign: true,
    lateFeeAutomation: true,
    documentVault: true,
    multiPropertyDashboard: false,
    exportableLedgers: false,
    blurb: "Everything in Keys plus lease e-sign, late-fee automation and the document vault.",
  },
  portfolio: {
    id: "portfolio",
    name: "Portfolio",
    priceMonthly: 59,
    units: 20,
    collaborators: 5,
    eSign: true,
    lateFeeAutomation: true,
    documentVault: true,
    multiPropertyDashboard: true,
    exportableLedgers: true,
    blurb: "Everything in Building plus the multi-property dashboard and exportable ledgers for tax season.",
  },
};

export const PLAN_ORDER: PlanId[] = ["keys", "building", "portfolio"];

export function plan(id: PlanId | null | undefined): Plan {
  return (id && PLANS[id]) || PLANS.keys;
}

/** Where a Stripe price id lands. Anything unrecognised falls to the entry plan. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { keys: string; building: string; portfolio: string },
): PlanId {
  if (!priceId) return "keys";
  if (priceId === prices.portfolio) return "portfolio";
  if (priceId === prices.building) return "building";
  return "keys";
}

export interface UnitGate {
  allowed: boolean;
  used: number;
  limit: number;
  reason?: string;
}

/** Can this account add another unit? */
export function canAddUnit(planId: PlanId, unitsUsed: number): UnitGate {
  const limit = plan(planId).units;
  if (unitsUsed < limit) return { allowed: true, used: unitsUsed, limit };
  const next = nextPlanUp(planId);
  return {
    allowed: false,
    used: unitsUsed,
    limit,
    reason: next
      ? `${plan(planId).name} covers ${limit} unit${limit === 1 ? "" : "s"}. ${plan(next).name} covers ${plan(next).units} for $${plan(next).priceMonthly}/mo.`
      : `${plan(planId).name} covers ${limit} units, the most TenantFile is built for. Above 20 units you want a property manager, not us.`,
  };
}

export function nextPlanUp(planId: PlanId): PlanId | null {
  const i = PLAN_ORDER.indexOf(planId);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

/** The smallest plan that covers this many units — used to suggest an upgrade. */
export function planForUnits(units: number): PlanId {
  return PLAN_ORDER.find((id) => PLANS[id].units >= units) ?? "portfolio";
}

/**
 * On a downgrade, the units past the new cap. They are *listed*, never deleted
 * and never unlinked from their ledger: a landlord whose card expired must not
 * lose a tenancy record. The UI shows them read-only until they upgrade.
 */
export function overflowUnits<T>(planId: PlanId, unitsOldestFirst: readonly T[]): T[] {
  const limit = plan(planId).units;
  return unitsOldestFirst.length <= limit ? [] : unitsOldestFirst.slice(limit);
}

export function featureAllowed(
  planId: PlanId,
  feature: "eSign" | "lateFeeAutomation" | "documentVault" | "multiPropertyDashboard" | "exportableLedgers",
): boolean {
  return plan(planId)[feature];
}
