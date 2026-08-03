/**
 * Plans and document caps. Pure — no database, no Stripe — so the UI, the ingest
 * path and the extraction sweep all ask the same questions and get the same
 * answers.
 *
 * The cap is **soft** by design (README, "Overage is soft"): document 76 on Solo
 * does not fail, does not bill, and is not deleted. It parks in `queued` with a
 * visible notice and processes the moment the next cycle starts or the plan
 * changes. Never a surprise bill, never data held hostage.
 */

import type { Plan } from "@/db/schema";

export interface PlanFeatures {
  id: Plan;
  name: string;
  priceCents: number;
  /** Documents extracted per calendar month. */
  documentCap: number;
  /** QBO- and Xero-shaped CSVs in the close package (generic CSV is on every plan). */
  accountingExports: boolean;
  /** Read-only accountant share links. */
  accountantSharing: boolean;
  /** Recurring-vendor rules learned from corrections. */
  vendorRules: boolean;
  blurb: string;
}

export const PLANS: Record<Plan, PlanFeatures> = {
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 1_900,
    documentCap: 75,
    accountingExports: false,
    accountantSharing: false,
    vendorRules: false,
    blurb:
      "Up to 75 documents a month. Receipt inbox by email and camera, extraction with confidence flags, review queue, monthly close package with CSV.",
  },
  operator: {
    id: "operator",
    name: "Operator",
    priceCents: 3_900,
    documentCap: 300,
    accountingExports: true,
    accountantSharing: true,
    vendorRules: true,
    blurb:
      "Up to 300 documents a month, QuickBooks and Xero export formats, learned vendor rules, and a read-only link for your accountant.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceCents: 7_900,
    documentCap: 1_000,
    accountingExports: true,
    accountantSharing: true,
    vendorRules: true,
    blurb:
      "Up to 1,000 documents a month with priority extraction — for the operator whose shoebox is a filing cabinet.",
  },
};

export const PLAN_ORDER: Plan[] = ["solo", "operator", "pro"];

/** Kept as its own export because the extraction path reads only this. */
export const PLAN_DOCUMENT_CAPS: Record<Plan, number> = {
  solo: PLANS.solo.documentCap,
  operator: PLANS.operator.documentCap,
  pro: PLANS.pro.documentCap,
};

export function plan(id: Plan | string | null | undefined): PlanFeatures {
  return PLANS[(id ?? "solo") as Plan] ?? PLANS.solo;
}

export function planCap(id: Plan | string | null | undefined): number {
  return plan(id).documentCap;
}

/** The cheapest plan that includes a gated feature — for the upgrade prompt copy. */
export function planRequiredFor(
  feature: "accountingExports" | "accountantSharing" | "vendorRules",
): Plan {
  return PLAN_ORDER.find((id) => PLANS[id][feature]) ?? "pro";
}

export interface DocumentCapacity {
  cap: number;
  extracted: number;
  remaining: number;
  atCap: boolean;
}

/**
 * How much extraction room is left this period. `extracted` counts documents the
 * extractor actually ran on — an ingested document that parks over the cap has not
 * cost anything yet and must not count against the cap it is waiting on.
 */
export function documentCapacity(planId: Plan, extractedThisPeriod: number): DocumentCapacity {
  const cap = planCap(planId);
  const extracted = Math.max(0, extractedThisPeriod);
  return {
    cap,
    extracted,
    remaining: Math.max(0, cap - extracted),
    atCap: extracted >= cap,
  };
}

export function formatPlanPrice(planId: Plan): string {
  return `$${Math.round(plan(planId).priceCents / 100)}/mo`;
}

/** Annual billing is two months free — the pricing page states the arithmetic. */
export function annualPriceCents(planId: Plan): number {
  return plan(planId).priceCents * 10;
}
