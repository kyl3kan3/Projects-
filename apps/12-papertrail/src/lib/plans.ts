/**
 * Plan catalog — the single source of truth for tiers, limits, and gates.
 * Mirrors the pricing table in README.md. Prices here are display-only; the
 * billable Stripe price IDs live in env.
 *
 * The Free tier's cap is documents *created* per calendar month, counted in UTC.
 * Deliberately not "documents sent": a freelancer who drafts three proposals,
 * sends none, and then hits a wall would rightly call that a bait-and-switch, so
 * the count and the limit are both explained in the UI before they draft.
 */

import type { PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  /** Documents creatable per calendar month. Infinity on paid tiers. */
  documentsPerMonth: number;
  brands: number;
  seats: number;
  /** Free keeps the "Sent with PaperTrail" line on client sheets. */
  badge: boolean;
  customBranding: boolean;
  senderDomain: boolean;
  autoReminders: boolean;
  depositInvoices: boolean;
  csvExport: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    documentsPerMonth: 3,
    brands: 1,
    seats: 1,
    badge: true,
    customBranding: false,
    senderDomain: false,
    autoReminders: false,
    depositInvoices: false,
    csvExport: true,
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceMonthly: 12,
    priceYearly: 99,
    documentsPerMonth: Infinity,
    brands: 1,
    seats: 1,
    badge: false,
    customBranding: true,
    senderDomain: true,
    autoReminders: true,
    depositInvoices: true,
    csvExport: true,
  },
  studio: {
    id: "studio",
    name: "Studio",
    priceMonthly: 29,
    priceYearly: 290,
    documentsPerMonth: Infinity,
    brands: 3,
    seats: 3,
    badge: false,
    customBranding: true,
    senderDomain: true,
    autoReminders: true,
    depositInvoices: true,
    csvExport: true,
  },
};

export const PAID_PLANS: Exclude<PlanId, "free">[] = ["solo", "studio"];

export function plan(id: PlanId | null | undefined): Plan {
  return (id && PLANS[id]) || PLANS.free;
}

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
  allowed: boolean;
}

/** Where an account stands against its monthly document allowance. */
export function documentQuota(planId: PlanId, usedThisMonth: number): Quota {
  const limit = plan(planId).documentsPerMonth;
  const used = Math.max(0, usedThisMonth);
  const remaining = limit === Infinity ? Infinity : Math.max(0, limit - used);
  return { used, limit, remaining, allowed: remaining > 0 };
}

/**
 * Whether a new document may be created. Documents generated *by the chain* —
 * the contract from an accepted proposal, the deposit invoice from a signature —
 * never count against the cap: refusing to invoice work that is already signed
 * would cost the freelancer money to punish them for being on the free tier.
 */
export function canCreateDocument(
  planId: PlanId,
  usedThisMonth: number,
  origin: "manual" | "chain" = "manual",
): { allowed: boolean; reason?: string } {
  if (origin === "chain") return { allowed: true };
  const quota = documentQuota(planId, usedThisMonth);
  if (quota.allowed) return { allowed: true };
  return {
    allowed: false,
    reason: `The Free plan covers ${quota.limit} new documents a month. Upgrade to Solo for unlimited documents, deposits, and reminders.`,
  };
}

export function canAddBrand(planId: PlanId, existing: number): { allowed: boolean; reason?: string } {
  const limit = plan(planId).brands;
  if (existing < limit) return { allowed: true };
  return {
    allowed: false,
    reason:
      limit === 1
        ? "Multiple brands are a Studio feature. Your current brand can be edited freely."
        : `Your plan covers ${limit} brands.`,
  };
}

/** Resolve which plan a Stripe price ID corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { solo: string; studio: string },
): PlanId {
  if (priceId && priceId === prices.studio) return "studio";
  if (priceId && priceId === prices.solo) return "solo";
  return "free";
}
