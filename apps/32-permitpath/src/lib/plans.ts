/**
 * Plan catalog — the single source of truth for tiers, prices, and limits.
 * Mirrors the pricing table in README.md exactly. Stripe price ids live in env;
 * everything a screen or a gate needs lives here.
 *
 * Pure module (no db import) so pricing copy can render in a client component
 * without dragging `postgres` into the browser bundle.
 */

import type { Plan, PlanInterval } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  /** Monthly price in integer cents. Annual is ten months (two months free). */
  monthlyCents: number;
  users: number;
  /** `null` means unlimited — Regional's active-job allowance. */
  activeJobs: number | null;
  jurisdictionsWatched: number;
  /** One line for the pricing table, in the buyer's language. */
  headline: string;
  features: readonly string[];
}

export const PLANS: Record<Plan, PlanSpec> = {
  crew: {
    id: "crew",
    name: "Crew",
    monthlyCents: 9_900,
    users: 3,
    activeJobs: 15,
    jurisdictionsWatched: 5,
    headline: "One truck's worth of jurisdictions, covered properly.",
    features: [
      "Requirement lookup across every covered jurisdiction",
      "Per-job permit checklists with the verification stamp",
      "Application status tracking",
      "Licence and permit expiry alerts",
    ],
  },
  company: {
    id: "company",
    name: "Company",
    monthlyCents: 17_900,
    users: 10,
    activeJobs: 50,
    jurisdictionsWatched: 20,
    headline: "A metro's worth of suburbs, watched for rule changes.",
    features: [
      "Everything in Crew",
      "Rule-change alerts on watched jurisdictions",
      "Inspection scheduling notes",
      "Team assignments and weekly digest",
    ],
  },
  regional: {
    id: "regional",
    name: "Regional",
    monthlyCents: 24_900,
    users: 25,
    activeJobs: null,
    jurisdictionsWatched: 60,
    headline: "Multi-entity licences, priority re-verification, CSV export.",
    features: [
      "Everything in Company",
      "Multi-licence entity tracking",
      "Priority verification requests, re-verified within 2 business days",
      "CSV export and priority support",
    ],
  },
};

export const PLAN_ORDER: readonly Plan[] = ["crew", "company", "regional"] as const;

export function planSpec(id: Plan): PlanSpec {
  return PLANS[id] ?? PLANS.crew;
}

/**
 * Annual price: two months free, per README ("Annual = 2 months free"). Ten
 * months of the monthly rate, in cents — computed once, here, rather than as a
 * 0.8333 multiplier at three call sites.
 */
export function annualCents(id: Plan): number {
  return planSpec(id).monthlyCents * 10;
}

export function priceCents(id: Plan, interval: PlanInterval): number {
  return interval === "year" ? annualCents(id) : planSpec(id).monthlyCents;
}

/** What the annual prepay saves, in cents — used verbatim on the pricing page. */
export function annualSavingCents(id: Plan): number {
  return planSpec(id).monthlyCents * 12 - annualCents(id);
}

export interface LimitCheck {
  allowed: boolean;
  used: number;
  limit: number | null;
  /** Written for the contractor, naming the next tier that fits. */
  message: string | null;
}

function nextPlanUp(id: Plan): Plan | null {
  const i = PLAN_ORDER.indexOf(id);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

function upgradeHint(id: Plan, what: string): string {
  const next = nextPlanUp(id);
  if (!next) return `You have reached the ${planSpec(id).name} limit for ${what}.`;
  return `${planSpec(id).name} covers ${what} up to its limit. ${planSpec(next).name} raises it.`;
}

export function checkActiveJobs(plan: Plan, used: number): LimitCheck {
  const limit = planSpec(plan).activeJobs;
  if (limit === null) return { allowed: true, used, limit: null, message: null };
  const allowed = used < limit;
  return {
    allowed,
    used,
    limit,
    message: allowed ? null : `${used} of ${limit} active jobs used. ${upgradeHint(plan, "active jobs")}`,
  };
}

export function checkWatches(plan: Plan, used: number): LimitCheck {
  const limit = planSpec(plan).jurisdictionsWatched;
  const allowed = used < limit;
  return {
    allowed,
    used,
    limit,
    message: allowed
      ? null
      : `${used} of ${limit} jurisdictions watched. ${upgradeHint(plan, "watched jurisdictions")}`,
  };
}

export function checkUsers(plan: Plan, used: number): LimitCheck {
  const limit = planSpec(plan).users;
  const allowed = used < limit;
  return {
    allowed,
    used,
    limit,
    message: allowed ? null : `${used} of ${limit} users used. ${upgradeHint(plan, "users")}`,
  };
}

/** Rule-change alerting starts at Company, per the pricing table. */
export function hasRuleChangeAlerts(plan: Plan): boolean {
  return plan !== "crew";
}

/* ---- Contribution credits -------------------------------------------- */

/** $10 per accepted edit, per README's crowdsourcing note. Integer cents. */
export const CONTRIBUTION_CREDIT_CENTS = 1_000;

/**
 * Credits are capped at 50% of the invoice they would offset. The cap is
 * applied against the plan's own price, in cents, and rounds once — here.
 */
export function creditCapCents(plan: Plan, interval: PlanInterval): number {
  return Math.floor(priceCents(plan, interval) / 2);
}

/**
 * How much of a pending credit balance may actually be applied to the next
 * invoice, and what stays parked. Returning both halves keeps the billing
 * screen honest: a contributor with $180 of credit on a $99 plan sees $49.50
 * applied and $130.50 carried, not a silent haircut.
 */
export function applicableCredit(
  balanceCents: number,
  plan: Plan,
  interval: PlanInterval,
): { appliedCents: number; carriedCents: number } {
  const cap = creditCapCents(plan, interval);
  const applied = Math.max(0, Math.min(balanceCents, cap));
  return { appliedCents: applied, carriedCents: Math.max(0, balanceCents - applied) };
}
