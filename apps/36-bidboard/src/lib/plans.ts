/**
 * Plan limits and gating.
 *
 * Pricing is per GC account by active projects and seats — never per sub. Subs
 * are free forever and never log in; that is the adoption wedge, so nothing in
 * here can ever count them.
 *
 * A limit reached always produces a named reason and an upgrade target. Silence
 * is the one behaviour that is never acceptable: an estimator who cannot create
 * a project the night before a bid needs to know why in one sentence.
 */

import type { Plan } from "@/db/schema";

export interface PlanLimits {
  /** Projects in draft/bidding/leveling. Awarded and archived stop counting. */
  activeProjects: number;
  seats: number;
  /** Plan-set storage across all projects. */
  storageGb: number;
}

export interface PlanInfo extends PlanLimits {
  id: Plan;
  name: string;
  priceMonthly: number;
  blurb: string;
  features: string[];
}

export const PLANS: Record<Plan, PlanInfo> = {
  crew: {
    id: "crew",
    name: "Crew",
    priceMonthly: 149,
    activeProjects: 3,
    seats: 2,
    storageGb: 25,
    blurb: "One estimator and a partner, two or three jobs out for bid at a time.",
    features: [
      "Trade packages and bid forms",
      "Sub invites with T-7 / T-3 / T-1 reminders",
      "No-login bid portal",
      "Side-by-side leveling",
      "Award and notify",
      "25 GB of plan sets",
    ],
  },
  builder: {
    id: "builder",
    name: "Builder",
    priceMonthly: 249,
    activeProjects: 10,
    seats: 5,
    storageGb: 100,
    blurb: "A real precon rhythm: ten jobs live, a team of five, exports for the owner.",
    features: [
      "Everything in Crew",
      "Bid-form templates",
      "Inclusion/exclusion matrix",
      "CSV and PDF leveling exports",
      "Sub coverage on the status board",
      "100 GB of plan sets",
    ],
  },
  precon: {
    id: "precon",
    name: "Precon",
    priceMonthly: 399,
    activeProjects: Number.POSITIVE_INFINITY,
    seats: 12,
    storageGb: 500,
    blurb: "Unlimited projects and twelve seats, for a shop that bids for a living.",
    features: [
      "Everything in Builder",
      "Unlimited active projects",
      "12 seats",
      "Custom branding on the portal",
      "Priority support",
      "500 GB of plan sets",
    ],
  },
};

export const PLAN_ORDER: Plan[] = ["crew", "builder", "precon"];

export function planLimits(plan: Plan): PlanLimits {
  const p = PLANS[plan] ?? PLANS.crew;
  return { activeProjects: p.activeProjects, seats: p.seats, storageGb: p.storageGb };
}

/** The next plan up, or null at the top. Used by every over-limit message. */
export function nextPlan(plan: Plan): Plan | null {
  const i = PLAN_ORDER.indexOf(plan);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

export interface GateResult {
  allowed: boolean;
  reason: string | null;
  upgradeTo: Plan | null;
}

const ALLOWED: GateResult = { allowed: true, reason: null, upgradeTo: null };

function blocked(reason: string, plan: Plan): GateResult {
  const up = nextPlan(plan);
  return {
    allowed: false,
    reason: up ? `${reason} ${PLANS[up].name} raises the limit.` : reason,
    upgradeTo: up,
  };
}

/** May this company start another project? */
export function canCreateProject(plan: Plan, activeProjects: number): GateResult {
  const limit = planLimits(plan).activeProjects;
  if (activeProjects < limit) return ALLOWED;
  return blocked(
    `${PLANS[plan].name} covers ${limit} active project${limit === 1 ? "" : "s"} and you have ${activeProjects}. Award or archive one to free a slot, or upgrade.`,
    plan,
  );
}

/** May this company add another seat? Seats are people on the GC side only. */
export function canAddSeat(plan: Plan, seatsUsed: number): GateResult {
  const limit = planLimits(plan).seats;
  if (seatsUsed < limit) return ALLOWED;
  return blocked(
    `${PLANS[plan].name} includes ${limit} seat${limit === 1 ? "" : "s"} and all ${seatsUsed} are in use.`,
    plan,
  );
}

/** May this company store another `bytes` of plans? */
export function canStore(plan: Plan, usedBytes: number, addBytes: number): GateResult {
  const limitBytes = planLimits(plan).storageGb * 1024 ** 3;
  if (usedBytes + addBytes <= limitBytes) return ALLOWED;
  return blocked(
    `${PLANS[plan].name} includes ${planLimits(plan).storageGb} GB of plan storage and this upload would pass it.`,
    plan,
  );
}

/**
 * Exports and the matrix are Builder-and-up features (see README's pricing
 * table). Crew still gets the leveling grid — the grid is the product.
 */
export function hasLevelingExports(plan: Plan): boolean {
  return plan !== "crew";
}

export function hasBidFormTemplates(plan: Plan): boolean {
  return plan !== "crew";
}

/**
 * Projects over the limit after a downgrade are read-only, never deleted.
 * Oldest-first is the wrong order here — the estimator's newest projects are the
 * live ones, so the *oldest* keep their slots being useless. Rank by due date:
 * the soonest due stay editable.
 */
export function pausedProjectIds(
  plan: Plan,
  projects: { id: string; bidDueAt: Date }[],
): string[] {
  const limit = planLimits(plan).activeProjects;
  if (!Number.isFinite(limit) || projects.length <= limit) return [];
  return [...projects]
    .sort((a, b) => a.bidDueAt.getTime() - b.bidDueAt.getTime())
    .slice(limit)
    .map((p) => p.id);
}
