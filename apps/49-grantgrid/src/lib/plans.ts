/**
 * Plan catalog — the single source of truth for the three tiers in README.md.
 *
 * The gating rule that matters: going over a cap blocks the *next* add and shows
 * an upgrade prompt. It never deletes, hides, or stops reminding about anything
 * already in the pipeline. A nonprofit that downgrades in a lean quarter must not
 * lose the deadline that keeps its funding.
 */

import type { Plan } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  priceMonthlyCents: number;
  /** Annual = ten months' money for twelve months. */
  priceAnnualCents: number;
  blurb: string;
  trackedGrants: number;
  users: number;
  organizations: number;
  discovery: boolean;
  workspace: boolean;
  exports: boolean;
  features: string[];
}

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLANS: Record<Plan, PlanSpec> = {
  seed: {
    id: "seed",
    name: "Seed",
    priceMonthlyCents: 5900,
    priceAnnualCents: 59000,
    blurb: "Getting organized",
    trackedGrants: 25,
    users: 3,
    organizations: 1,
    discovery: false,
    workspace: false,
    exports: false,
    features: [
      "Pipeline and deadline calendar",
      "Answer library with staleness flags",
      "Award and report reminders",
      "25 tracked grants, 3 users",
    ],
  },
  grow: {
    id: "grow",
    name: "Grow",
    priceMonthlyCents: 9900,
    priceAnnualCents: 99000,
    blurb: "Actively applying",
    trackedGrants: UNLIMITED,
    users: 10,
    organizations: 1,
    discovery: true,
    workspace: true,
    exports: false,
    features: [
      "Everything in Seed",
      "Curated discovery feed with fit scoring",
      "Application workspace",
      "Unlimited tracked grants, 10 users",
    ],
  },
  field: {
    id: "field",
    name: "Field",
    priceMonthlyCents: 19900,
    priceAnnualCents: 199000,
    blurb: "Consultants & multi-program orgs",
    trackedGrants: UNLIMITED,
    users: 25,
    organizations: 3,
    discovery: true,
    workspace: true,
    exports: true,
    features: [
      "Everything in Grow",
      "3 organizations, shared answer libraries",
      "CSV and board-report exports",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: Plan[] = ["seed", "grow", "field"];

export function plan(id: Plan | null | undefined): PlanSpec {
  return PLANS[(id ?? "seed") as Plan] ?? PLANS.seed;
}

export function trackedGrantCap(id: Plan): number {
  return plan(id).trackedGrants;
}

export function isUnlimited(n: number): boolean {
  return n >= UNLIMITED;
}

/** Discovery + fit scoring start at Grow (README pricing table). */
export function hasDiscovery(id: Plan): boolean {
  return plan(id).discovery;
}

export function hasWorkspace(id: Plan): boolean {
  return plan(id).workspace;
}

export interface CapCheck {
  allowed: boolean;
  cap: number;
  used: number;
  message: string | null;
}

/**
 * Can this org add one more tracked grant? The message names the number, the
 * plan, and the next tier — an upgrade prompt that makes the user do arithmetic
 * is an upgrade prompt that gets ignored.
 */
export function checkGrantCap(id: Plan, currentCount: number): CapCheck {
  const cap = trackedGrantCap(id);
  if (isUnlimited(cap) || currentCount < cap) {
    return { allowed: true, cap, used: currentCount, message: null };
  }
  return {
    allowed: false,
    cap,
    used: currentCount,
    message: `${plan(id).name} tracks ${cap} grants and you have ${currentCount}. Nothing has been removed — upgrade to Grow for unlimited tracked grants, or close out a declined grant to free a slot.`,
  };
}

/** Trial length in days, per README ("14-day free trial"). */
export const TRIAL_DAYS = 14;

export type BillingInterval = "monthly" | "annual";

export function priceCents(id: Plan, interval: BillingInterval): number {
  return interval === "annual" ? plan(id).priceAnnualCents : plan(id).priceMonthlyCents;
}

/** "$59/mo" or "$590/yr" — display only; Stripe holds the billable price. */
export function priceLabel(id: Plan, interval: BillingInterval): string {
  const cents = priceCents(id, interval);
  const amount = (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return interval === "annual" ? `$${amount}/yr` : `$${amount}/mo`;
}

/** Two months free, stated as the saving rather than as a percentage. */
export function annualSavingLabel(id: Plan): string {
  const monthly = plan(id).priceMonthlyCents * 12;
  const annual = plan(id).priceAnnualCents;
  const saved = (monthly - annual) / 100;
  return `Save $${saved.toLocaleString("en-US", { maximumFractionDigits: 0 })} a year`;
}

/** Which plan a Stripe price ID belongs to; unknown prices fall back to Seed. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: Record<Plan, string>,
): Plan {
  if (!priceId) return "seed";
  const hit = PLAN_ORDER.find((id) => prices[id] && prices[id] === priceId);
  return hit ?? "seed";
}
