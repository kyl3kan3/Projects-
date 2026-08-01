/**
 * Plan catalog — the single source of truth for tiers, limits, and gates.
 * Mirrors the pricing table in README.md exactly. Prices are display-only; the
 * billable Stripe price ids live in env.
 *
 * The gating rule from ROADMAP: over-limit prompts an upgrade, it never blocks
 * silently. An association that grows from 74 to 76 units mid-quarter must still
 * be able to bill all 76 — the treasurer sees a banner, not a wall.
 */

import type { Plan as PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  /** Households/units included. */
  units: number;
  sms: boolean;
  lateFeeRules: boolean;
  paymentPlans: boolean;
  documentLibrary: boolean;
  boardRoles: boolean;
  exports: boolean;
  multiProperty: boolean;
  apiExport: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  block: {
    id: "block",
    name: "Block",
    priceMonthly: 49,
    units: 75,
    sms: false,
    lateFeeRules: false,
    paymentPlans: false,
    documentLibrary: false,
    boardRoles: false,
    exports: false,
    multiProperty: false,
    apiExport: false,
  },
  neighborhood: {
    id: "neighborhood",
    name: "Neighborhood",
    priceMonthly: 99,
    units: 200,
    sms: true,
    lateFeeRules: true,
    paymentPlans: true,
    documentLibrary: true,
    boardRoles: true,
    exports: true,
    multiProperty: false,
    apiExport: false,
  },
  community: {
    id: "community",
    name: "Community",
    priceMonthly: 199,
    units: 500,
    sms: true,
    lateFeeRules: true,
    paymentPlans: true,
    documentLibrary: true,
    boardRoles: true,
    exports: true,
    multiProperty: true,
    apiExport: true,
  },
};

export const PLAN_ORDER: PlanId[] = ["block", "neighborhood", "community"];

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.block;
}

export type Feature = keyof Pick<
  Plan,
  | "sms"
  | "lateFeeRules"
  | "paymentPlans"
  | "documentLibrary"
  | "boardRoles"
  | "exports"
  | "multiProperty"
  | "apiExport"
>;

export function featureAllowed(id: PlanId, feature: Feature): boolean {
  return plan(id)[feature];
}

/** The cheapest plan that includes a feature — what an upgrade prompt names. */
export function planForFeature(feature: Feature): Plan {
  for (const id of PLAN_ORDER) {
    if (PLANS[id][feature]) return PLANS[id];
  }
  return PLANS.community;
}

export interface UnitUsage {
  used: number;
  included: number;
  over: number;
  /** Warn from 90% so a board is never surprised by an upgrade prompt. */
  nearLimit: boolean;
}

export function unitUsage(id: PlanId, activeHouseholds: number): UnitUsage {
  const included = plan(id).units;
  return {
    used: activeHouseholds,
    included,
    over: Math.max(0, activeHouseholds - included),
    nearLimit: activeHouseholds >= Math.floor(included * 0.9),
  };
}

/** Resolve which plan a Stripe price id corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: Record<PlanId, string>,
): PlanId | null {
  if (!priceId) return null;
  for (const id of PLAN_ORDER) {
    if (prices[id] && prices[id] === priceId) return id;
  }
  return null;
}

/* --------------------------------------------------------------- board roles --- */

export type BoardRole = "president" | "treasurer" | "secretary" | "member";

export const ROLE_LABELS: Record<BoardRole, string> = {
  president: "President",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Board member",
};

export type Capability =
  | "money" // record payments, generate invoices, waive fees
  | "roster" // households, members, portal links
  | "issues" // violations and requests
  | "announce"
  | "documents"
  | "settings" // association settings, roles, billing
;

const ROLE_CAPABILITIES: Record<BoardRole, Capability[]> = {
  president: ["money", "roster", "issues", "announce", "documents", "settings"],
  treasurer: ["money", "roster", "issues", "announce", "documents", "settings"],
  secretary: ["roster", "issues", "announce", "documents"],
  // A plain board member reads everything and changes nothing. Boards rotate;
  // read access is how the next treasurer learns the ledger before taking it.
  member: [],
};

export function can(role: BoardRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false;
}
