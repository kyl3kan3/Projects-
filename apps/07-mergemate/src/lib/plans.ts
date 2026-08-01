/**
 * Plan catalog — the single source of truth for tiers and gates.
 * Mirrors the pricing table in README.md.
 *
 * The gate that actually decides whether work happens is `reviewAllowed`: public
 * repositories are free forever (the OSS flywheel), private repositories need a
 * paid plan. Everything else here is a limit, and limits are advisory — going over
 * one produces a notice, not a silent stop, because a team that has just added a
 * developer should not discover it by their reviews vanishing.
 */

import type { PlanId } from "../db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  pricePerSeatUsd: number;
  privateRepos: boolean;
  /** Custom rules the rulebook may define. */
  customRules: number;
  /** Business tier can move the confidence threshold. */
  tunableThreshold: boolean;
  /** Business tier shares dismissals across the org. */
  orgWideSuppressions: boolean;
  priorityQueue: boolean;
  auditLogDays: number;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free (OSS)",
    pricePerSeatUsd: 0,
    privateRepos: false,
    customRules: 4,
    tunableThreshold: false,
    orgWideSuppressions: false,
    priorityQueue: false,
    auditLogDays: 0,
  },
  team: {
    id: "team",
    name: "Team",
    pricePerSeatUsd: 12,
    privateRepos: true,
    customRules: 25,
    tunableThreshold: false,
    orgWideSuppressions: false,
    priorityQueue: false,
    auditLogDays: 30,
  },
  business: {
    id: "business",
    name: "Business",
    pricePerSeatUsd: 20,
    privateRepos: true,
    customRules: Number.MAX_SAFE_INTEGER,
    tunableThreshold: true,
    orgWideSuppressions: true,
    priorityQueue: true,
    auditLogDays: 365,
  },
};

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.free;
}

export type ReviewGate =
  | { allowed: true }
  | { allowed: false; reason: "plan_required" | "suspended" | "repo_disabled" };

/**
 * May we review this pull request at all?
 *
 * Free covers public repositories without limit. A private repository on Free is
 * refused here, before any diff is fetched or any token is spent.
 */
export function reviewAllowed(input: {
  planId: PlanId;
  repoIsPrivate: boolean;
  repoEnabled: boolean;
  installationSuspended: boolean;
}): ReviewGate {
  if (input.installationSuspended) return { allowed: false, reason: "suspended" };
  if (!input.repoEnabled) return { allowed: false, reason: "repo_disabled" };
  if (input.repoIsPrivate && !plan(input.planId).privateRepos) {
    return { allowed: false, reason: "plan_required" };
  }
  return { allowed: true };
}

/** Rules over the plan's allowance are dropped, tightest-first order preserved. */
export function allowedRuleCount(planId: PlanId): number {
  return plan(planId).customRules;
}

/**
 * Whether an installation-level threshold override is honoured. On Free and Team
 * the rulebook's value stands; only Business may tune it.
 */
export function thresholdOverrideFor(
  planId: PlanId,
  settingsThreshold: number | undefined,
): number | undefined {
  if (settingsThreshold === undefined) return undefined;
  return plan(planId).tunableThreshold ? settingsThreshold : undefined;
}

export function suppressionScopeFor(planId: PlanId, orgWideEnabled: boolean | undefined) {
  return plan(planId).orgWideSuppressions && orgWideEnabled === true
    ? ("installation" as const)
    : ("repository" as const);
}

/** Seats are unique PR authors in a billing period; the period is the calendar month. */
export function billingPeriodStart(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function seatNotice(input: {
  planId: PlanId;
  seatsUsed: number;
  seatLimit: number;
}): string | null {
  if (input.planId === "free" || input.seatLimit <= 0) return null;
  if (input.seatsUsed <= input.seatLimit) return null;
  return `This installation has ${input.seatsUsed} active pull-request authors this month against ${input.seatLimit} paid seats. Reviews continue; an admin can add seats in the GitHub Marketplace.`;
}
