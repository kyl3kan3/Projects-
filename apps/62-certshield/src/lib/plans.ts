/**
 * src/lib/plans.ts
 *
 * The plan catalogue — one source of truth for the three tiers, the trial, and
 * what happens when neither is paying. Mirrors README.md's pricing table; the
 * billable Stripe price ids live in env.
 *
 * Two rules worth stating out loud:
 *
 *  - **Pricing is per company, not per certificate.** The vendor cap is a cap on
 *    the registry, and going over it blocks *adding* vendors. It never stops a
 *    certificate from being accepted or a verdict from being computed: a product
 *    that stops tracking insurance because the invoice is a tier too small has
 *    become the liability it was sold to remove.
 *  - **Read-only still exports binders.** When a trial lapses or a card fails, the
 *    org keeps every certificate and can still pull the audit binder. Holding an
 *    audit binder hostage over $99 is not a business model.
 */

import type { Org, PlanId } from "@/db/schema";

export interface Plan {
  id: PlanId;
  name: string;
  priceCents: number;
  /** Vendors in the registry. null = unlimited. */
  vendors: number | null;
  users: number;
  /** The read-only compliance hook for the PM system (README MVP item 8). */
  hooks: boolean;
  blurb: string;
}

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceCents: 0,
    // The trial carries Portfolio's caps: an evaluation that cannot hold the whole
    // vendor list is not an evaluation.
    vendors: 400,
    users: 5,
    hooks: true,
    blurb: "14 days, no card. Portfolio limits while you evaluate.",
  },
  ledger: {
    id: "ledger",
    name: "Ledger",
    priceCents: 9_900,
    vendors: 100,
    users: 2,
    hooks: false,
    blurb: "Up to 100 vendors, 2 users.",
  },
  portfolio: {
    id: "portfolio",
    name: "Portfolio",
    priceCents: 19_900,
    vendors: 400,
    users: 5,
    hooks: true,
    blurb: "Up to 400 vendors, 5 users, API/CSV hooks.",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    priceCents: 29_900,
    vendors: null,
    users: 50,
    hooks: true,
    blurb: "Unlimited vendors, SSO-ready, priority support.",
  },
};

export const PAID_PLANS: PlanId[] = ["ledger", "portfolio", "enterprise"];

export const TRIAL_DAYS = 14;

export function planFor(id: PlanId | string | null | undefined): Plan {
  return PLANS[(id ?? "trial") as PlanId] ?? PLANS.trial;
}

/** Which plan a Stripe price id corresponds to. Unknown prices never upgrade. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { ledger: string; portfolio: string; enterprise: string },
): PlanId | null {
  if (!priceId) return null;
  if (priceId === prices.enterprise) return "enterprise";
  if (priceId === prices.portfolio) return "portfolio";
  if (priceId === prices.ledger) return "ledger";
  return null;
}

export interface TrialState {
  onTrial: boolean;
  expired: boolean;
  daysLeft: number;
}

export function trialState(
  org: Pick<Org, "plan" | "trialEndsAt">,
  now: Date = new Date(),
): TrialState {
  if (org.plan !== "trial") return { onTrial: false, expired: false, daysLeft: 0 };
  if (!org.trialEndsAt) return { onTrial: true, expired: false, daysLeft: TRIAL_DAYS };
  const ms = org.trialEndsAt.getTime() - now.getTime();
  return {
    onTrial: true,
    expired: ms <= 0,
    daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)),
  };
}

export type AccessLevel = "full" | "read_only";

/**
 * A lapsed trial goes read-only: nothing is deleted, nothing is hidden, and the
 * binder export still works. Paid plans are full access — a failed payment is
 * Stripe's dunning to run, and the webhook drops the org back to `trial` with an
 * expired date only once the subscription is actually gone.
 */
export function accessLevel(
  org: Pick<Org, "plan" | "trialEndsAt">,
  now: Date = new Date(),
): AccessLevel {
  const trial = trialState(org, now);
  return trial.onTrial && trial.expired ? "read_only" : "full";
}

export interface VendorCap {
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
}

export function vendorCap(planId: PlanId, used: number): VendorCap {
  const limit = planFor(planId).vendors;
  if (limit == null) return { limit: null, used, remaining: null, reached: false };
  return { limit, used, remaining: Math.max(0, limit - used), reached: used >= limit };
}

export function userCap(planId: PlanId, used: number): { limit: number; reached: boolean } {
  const limit = planFor(planId).users;
  return { limit, reached: used >= limit };
}

/** "$99/mo" for the pricing table and the billing screen. */
export function priceLabel(plan: Plan): string {
  return plan.priceCents === 0 ? "Free" : `$${Math.round(plan.priceCents / 100)}/mo`;
}
