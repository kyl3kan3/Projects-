/**
 * Plan catalog — the single source of truth for tiers, limits and gates.
 * Mirrors the pricing table in README.md: priced per *business*, never per
 * internal seat, which is the whole anti-Copilot pitch.
 *
 * `trial` is not sold. Every workspace starts there for 14 days with two portals
 * so an agency can build a real portal before paying; it deliberately has no
 * white-label, so the upgrade nudge ("Powered by ClientDock") is visible from the
 * first minute.
 */

import type { PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  /** Client portals, excluding templates. Infinity on Studio. */
  portals: number;
  /** Logo + colour theming. */
  branding: boolean;
  /** portal.agencyname.com. */
  customDomain: boolean;
  /** Full de-branding: no "via ClientDock" line anywhere the client can see. */
  whiteLabel: boolean;
  /** Client-side e-approvals with an audit trail. */
  eApprovals: boolean;
  /** Stripe invoice embed, paid from the agency's own Connect account. */
  stripeInvoices: boolean;
  /** Agency-domain (DKIM-verified) notification email. */
  agencyEmail: boolean;
  /** Team roles beyond the owner. */
  teamRoles: boolean;
  /** Per-client adoption analytics. */
  clientAnalytics: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceMonthly: 0,
    portals: 2,
    branding: true,
    customDomain: false,
    whiteLabel: false,
    eApprovals: true,
    stripeInvoices: false,
    agencyEmail: false,
    teamRoles: false,
    clientAnalytics: false,
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceMonthly: 29,
    portals: 10,
    branding: true,
    customDomain: true,
    whiteLabel: false,
    eApprovals: false,
    stripeInvoices: false,
    agencyEmail: false,
    teamRoles: false,
    clientAnalytics: false,
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceMonthly: 79,
    portals: 50,
    branding: true,
    customDomain: true,
    whiteLabel: true,
    eApprovals: true,
    stripeInvoices: true,
    agencyEmail: true,
    teamRoles: false,
    clientAnalytics: false,
  },
  studio: {
    id: "studio",
    name: "Studio",
    priceMonthly: 149,
    portals: Number.POSITIVE_INFINITY,
    branding: true,
    customDomain: true,
    whiteLabel: true,
    eApprovals: true,
    stripeInvoices: true,
    agencyEmail: true,
    teamRoles: true,
    clientAnalytics: true,
  },
};

export const PAID_PLANS: PlanId[] = ["solo", "agency", "studio"];

export function plan(id: PlanId): Plan {
  return PLANS[id] ?? PLANS.trial;
}

/** Modules whose availability depends on the plan, with the reason to show. */
export const MODULE_GATE: Partial<Record<string, { needs: keyof Plan; upsell: string }>> = {
  approvals: {
    needs: "eApprovals",
    upsell: "Client-side e-approvals are on Agency — $79/mo, per business.",
  },
  invoices: {
    needs: "stripeInvoices",
    upsell: "The Stripe invoice embed is on Agency — $79/mo, per business.",
  },
};

/** Can this plan switch this module on? */
export function moduleAllowed(planId: PlanId, moduleId: string): boolean {
  const gate = MODULE_GATE[moduleId];
  if (!gate) return true;
  return Boolean(plan(planId)[gate.needs]);
}

/** Why a module is unavailable, or null when it is available. */
export function moduleUpsell(planId: PlanId, moduleId: string): string | null {
  if (moduleAllowed(planId, moduleId)) return null;
  return MODULE_GATE[moduleId]?.upsell ?? null;
}

/**
 * Whether another client portal may be created. Templates do not count against
 * the cap: they are the agency's own scaffolding, not a client relationship.
 */
export function canCreatePortal(planId: PlanId, currentPortalCount: number): boolean {
  return currentPortalCount < plan(planId).portals;
}

export function portalLimitMessage(planId: PlanId): string {
  const p = plan(planId);
  const next = p.id === "trial" ? PLANS.solo : p.id === "solo" ? PLANS.agency : PLANS.studio;
  return `The ${p.name} plan covers ${p.portals} client portals. ${next.name} covers ${
    next.portals === Number.POSITIVE_INFINITY ? "unlimited" : next.portals
  } for $${next.priceMonthly}/mo — per business, not per seat.`;
}

/** Solo and trial portals carry the "via ClientDock" footer; Agency+ never do. */
export function showsClientDockBadge(planId: PlanId): boolean {
  return !plan(planId).whiteLabel;
}

/** Resolve which plan a Stripe price ID corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { solo: string; agency: string; studio: string },
): PlanId {
  if (priceId && priceId === prices.studio) return "studio";
  if (priceId && priceId === prices.agency) return "agency";
  if (priceId && priceId === prices.solo) return "solo";
  return "trial";
}

/** Has the free trial run out? A workspace with no end date is not on trial. */
export function trialExpired(planId: PlanId, trialEndsAt: Date | null, now = new Date()): boolean {
  if (planId !== "trial") return false;
  if (!trialEndsAt) return false;
  return trialEndsAt.getTime() <= now.getTime();
}
