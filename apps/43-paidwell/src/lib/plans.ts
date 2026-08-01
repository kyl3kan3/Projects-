/**
 * Plans and gating. Pure — no database, no Stripe — so both the UI and the
 * import path can ask the same questions and get the same answers.
 *
 * One deliberate departure from README's pricing table: **approval mode is on
 * every plan.** The table lists "escalation approvals" as a Practice feature,
 * but queueing a money-chasing email for a human tap is the safety rail that
 * stops this product damaging a client relationship, and a safety rail behind a
 * paywall is not a safety rail. What Practice actually buys is delegation —
 * more seats and several managed firms, so a bookkeeper can queue sends the
 * firm's owner approves.
 */

import type { Plan } from "@/db/schema";

export interface PlanFeatures {
  id: Plan;
  name: string;
  priceCents: number;
  /** Open invoices the firm may track at once. */
  openInvoiceLimit: number;
  seats: number;
  /** Firms one login may operate (fractional-CFO mode). */
  managedFirms: number;
  /** The promises screen and reliability scoring. */
  promiseTracking: boolean;
  /** The weekly cash-in forecast. */
  forecast: boolean;
  /** Per-client risk profile: average days-to-pay, reliability. */
  clientRiskProfiles: boolean;
  blurb: string;
}

export const PLANS: Record<Plan, PlanFeatures> = {
  studio: {
    id: "studio",
    name: "Studio",
    priceCents: 7_900,
    openInvoiceLimit: 50,
    seats: 1,
    managedFirms: 1,
    promiseTracking: false,
    forecast: false,
    clientRiskProfiles: false,
    blurb: "One firm, up to 50 open invoices, sequences in your voice, payment portal, aging dashboard.",
  },
  firm: {
    id: "firm",
    name: "Firm",
    priceCents: 14_900,
    openInvoiceLimit: 250,
    seats: 2,
    managedFirms: 1,
    promiseTracking: true,
    forecast: true,
    clientRiskProfiles: true,
    blurb: "Up to 250 open invoices, promise-to-pay tracking, cash-flow forecast, client risk profiles, 2 seats.",
  },
  practice: {
    id: "practice",
    name: "Practice",
    priceCents: 24_900,
    openInvoiceLimit: Number.MAX_SAFE_INTEGER,
    seats: 5,
    managedFirms: 3,
    promiseTracking: true,
    forecast: true,
    clientRiskProfiles: true,
    blurb: "Unlimited invoices, 3 managed firms, API, 5 seats — the fractional-CFO console.",
  },
};

export const PLAN_ORDER: Plan[] = ["studio", "firm", "practice"];

export function plan(id: Plan | string | null | undefined): PlanFeatures {
  return PLANS[(id ?? "studio") as Plan] ?? PLANS.studio;
}

/** The plan a locked feature needs, for the upgrade prompt's copy. */
export function planRequiredFor(feature: "promiseTracking" | "forecast" | "clientRiskProfiles"): Plan {
  return PLAN_ORDER.find((id) => PLANS[id][feature]) ?? "practice";
}

export interface InvoiceCapacity {
  limit: number;
  used: number;
  remaining: number;
  atLimit: boolean;
}

/**
 * How much room is left under the plan's open-invoice cap. Import and sync ask
 * this before writing, and report what they skipped rather than silently
 * dropping invoices — a firm that cannot see 30 of its own invoices has a wrong
 * aging report, which is worse than a refused import.
 */
export function invoiceCapacity(planId: Plan, openInvoices: number): InvoiceCapacity {
  const limit = plan(planId).openInvoiceLimit;
  const used = Math.max(0, openInvoices);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    atLimit: used >= limit,
  };
}

export function formatPlanPrice(planId: Plan): string {
  return `$${(plan(planId).priceCents / 100).toFixed(0)}/mo`;
}
