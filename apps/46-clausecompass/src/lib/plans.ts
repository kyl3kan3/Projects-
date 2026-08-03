/**
 * src/lib/plans.ts
 *
 * Plans, prices and limits — pure data, so a client component can render the pricing
 * table without pulling the database client into the browser bundle.
 *
 * Money is integer cents everywhere. There is no floating-point arithmetic in this
 * app's billing path, and there never should be.
 */

import type { Plan } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  /** Recurring price in cents; 0 for the pay-as-you-go tier. */
  monthlyCents: number;
  /** Cents per single review, for the tier that sells them one at a time. */
  perContractCents: number;
  /** Credits granted at the start of each billing period. No rollover. */
  monthlyCredits: number;
  seats: number;
  customPlaybook: boolean;
  savedPlaybook: boolean;
  blurb: string;
  features: string[];
}

export const OVERAGE_CENTS = 900;

export const PLANS: Record<Plan, PlanSpec> = {
  per_contract: {
    id: "per_contract",
    name: "Per contract",
    monthlyCents: 0,
    perContractCents: 1900,
    monthlyCredits: 0,
    seats: 1,
    customPlaybook: false,
    savedPlaybook: false,
    blurb: "One contract, one price. No subscription.",
    features: [
      "One full review: every clause extracted and scored",
      "Plain-English explanations and suggested redlines",
      "Exportable PDF report, kept for 90 days",
    ],
  },
  freelancer: {
    id: "freelancer",
    name: "Freelancer",
    monthlyCents: 2900,
    perContractCents: 0,
    monthlyCredits: 5,
    seats: 1,
    customPlaybook: false,
    savedPlaybook: true,
    blurb: "For anyone who signs client paper more than twice a year.",
    features: [
      "5 contracts a month",
      "Your saved playbook thresholds",
      "Review history and the requested-changes email drafts",
      `Extra reviews at $${(OVERAGE_CENTS / 100).toFixed(0)} each, confirmed before you are charged`,
    ],
  },
  studio: {
    id: "studio",
    name: "Studio",
    monthlyCents: 7900,
    perContractCents: 0,
    monthlyCredits: 25,
    seats: 3,
    customPlaybook: true,
    savedPlaybook: true,
    blurb: "For studios and small teams reviewing vendor and client paper.",
    features: [
      "25 contracts a month, 3 seats",
      "Custom playbook rules and thresholds",
      "Clause library across every contract you have reviewed",
      `Extra reviews at $${(OVERAGE_CENTS / 100).toFixed(0)} each`,
    ],
  },
};

export const PLAN_ORDER: Plan[] = ["per_contract", "freelancer", "studio"];

export function planSpec(plan: Plan): PlanSpec {
  return PLANS[plan];
}

export function canEditPlaybook(plan: Plan): boolean {
  return PLANS[plan].customPlaybook;
}

/** Monthly credits don't roll over, and the UI says so wherever it says the number. */
export const NO_ROLLOVER_NOTE = "Unused monthly reviews do not roll over.";

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}
