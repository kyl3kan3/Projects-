/**
 * Plans, limits and the preview gate.
 *
 * The commercial shape from README.md: three paid plans, annual billing at two months
 * free, and a free **Footprint Preview** that is deliberately useful — one bill in, a
 * real partial Scope 2 number out — and deliberately incomplete: no full total, no
 * PDF, no answer bank.
 *
 * Every gate in the product reads from this file, and every gate is a pure function of
 * (plan, count). Nothing here touches a database or a request, so the boundaries are
 * testable and there is one place to look when a customer asks why they cannot add a
 * fourth site.
 */

import type { BillingInterval, Plan } from "@/db/schema";

export interface PlanDef {
  id: Plan;
  name: string;
  /** Monthly price in cents. Annual is ten months of it. */
  monthlyCents: number;
  sites: number;
  /** Documents per reporting period. Infinity on paid plans. */
  documents: number;
  blurb: string;
  features: string[];
  answerBank: boolean;
  reportDownload: boolean;
  brandedReport: boolean;
  fullTotal: boolean;
  prioritySupport: boolean;
}

export const PLANS: Record<Plan, PlanDef> = {
  preview: {
    id: "preview",
    name: "Footprint Preview",
    monthlyCents: 0,
    sites: 1,
    documents: 1,
    blurb: "One bill in, a real partial number out. No card.",
    features: [
      "1 site, 1 utility bill",
      "Partial Scope 2 estimate with its factor citation",
      "Report preview (watermarked, not downloadable)",
    ],
    answerBank: false,
    reportDownload: false,
    brandedReport: false,
    fullTotal: false,
    prioritySupport: false,
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyCents: 9_900,
    sites: 1,
    documents: Number.POSITIVE_INFINITY,
    blurb: "One site, one reporting year, a defensible number.",
    features: [
      "1 site, 12 months of bills",
      "Scope 1 and Scope 2 (location and market based)",
      "Scope 3 spend-based screen",
      "CSRD-lite PDF report",
    ],
    answerBank: false,
    reportDownload: true,
    brandedReport: false,
    fullTotal: true,
    prioritySupport: false,
  },
  standard: {
    id: "standard",
    name: "Standard",
    monthlyCents: 19_900,
    sites: 3,
    documents: Number.POSITIVE_INFINITY,
    blurb: "The questionnaire answer bank. This is the one that closes the form.",
    features: [
      "3 sites",
      "Questionnaire answer bank (CDP and EcoVadis style)",
      "Branded report header",
      "Everything in Starter",
    ],
    answerBank: true,
    reportDownload: true,
    brandedReport: true,
    fullTotal: true,
    prioritySupport: false,
  },
  supplier_plus: {
    id: "supplier_plus",
    name: "Supplier+",
    monthlyCents: 29_900,
    sites: 10,
    documents: Number.POSITIVE_INFINITY,
    blurb: "Ten sites, multi-entity roll-up, priority support.",
    features: [
      "10 sites with a multi-entity roll-up",
      "Procurement-portal response exports",
      "Priority support",
      "Everything in Standard",
    ],
    answerBank: true,
    reportDownload: true,
    brandedReport: true,
    fullTotal: true,
    prioritySupport: true,
  },
};

export const PAID_PLANS: Plan[] = ["starter", "standard", "supplier_plus"];

/** Annual price in cents: ten months for twelve, per README ("2 months free"). */
export function annualCents(plan: Plan): number {
  return PLANS[plan].monthlyCents * 10;
}

export function priceCents(plan: Plan, interval: BillingInterval): number {
  return interval === "year" ? annualCents(plan) : PLANS[plan].monthlyCents;
}

/** What the pricing card shows as the effective monthly rate on annual billing. */
export function effectiveMonthlyCents(plan: Plan, interval: BillingInterval): number {
  return interval === "year" ? Math.round(annualCents(plan) / 12) : PLANS[plan].monthlyCents;
}

export function isPaid(plan: Plan): boolean {
  return plan !== "preview";
}

/* ------------------------------------------------------------------- gates --- */

export interface GateResult {
  allowed: boolean;
  reason: string;
  /** The cheapest plan that would allow it, when one exists. */
  upgradeTo: Plan | null;
}

const ok: GateResult = { allowed: true, reason: "", upgradeTo: null };

export function canAddSite(plan: Plan, currentSites: number): GateResult {
  const limit = PLANS[plan].sites;
  if (currentSites < limit) return ok;
  const upgrade = PAID_PLANS.find((p) => PLANS[p].sites > currentSites) ?? null;
  return {
    allowed: false,
    reason:
      plan === "preview"
        ? "The free preview covers one site. Choose a plan to add more."
        : `${PLANS[plan].name} covers ${limit} site${limit === 1 ? "" : "s"}.`,
    upgradeTo: upgrade,
  };
}

export function canUploadDocument(plan: Plan, currentDocuments: number): GateResult {
  const limit = PLANS[plan].documents;
  if (currentDocuments < limit) return ok;
  return {
    allowed: false,
    reason:
      "The free preview reads one bill so you can see a real number. A plan reads the whole year.",
    upgradeTo: "starter",
  };
}

export function canUseAnswerBank(plan: Plan): GateResult {
  if (PLANS[plan].answerBank) return ok;
  return {
    allowed: false,
    reason:
      "The questionnaire answer bank is on Standard and Supplier+ — it is the part that fills in the form.",
    upgradeTo: "standard",
  };
}

export function canDownloadReport(plan: Plan): GateResult {
  if (PLANS[plan].reportDownload) return ok;
  return {
    allowed: false,
    reason: "The preview shows the report watermarked. Downloading the PDF needs a plan.",
    upgradeTo: "starter",
  };
}

/**
 * Whether the org may see its own full total.
 *
 * This is the sharp edge of the free tier and it is drawn honestly: a preview org sees
 * its Scope 2 figure for the bill it uploaded, with the real factor and citation, and
 * is told plainly that Scope 1 and Scope 3 are not included. It is never shown a
 * number that pretends to be a footprint.
 */
export function canSeeFullTotal(plan: Plan): boolean {
  return PLANS[plan].fullTotal;
}

/** The label the UI puts on the plan. */
export function planLabel(plan: Plan): string {
  return PLANS[plan].name;
}
