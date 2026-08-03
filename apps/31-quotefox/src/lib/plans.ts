/**
 * Plans, quotas, and gating. Pure functions — no database, no Stripe — so the
 * UI, the drafting pipeline and the tests all ask the same questions and get the
 * same answers.
 *
 * Two product rules from README that live here rather than being scattered:
 *
 *  - **Capture is never blocked.** Only *drafting a new quote* is gated by the
 *    monthly count. A contractor standing in an attic mid-walkthrough must never
 *    hit a paywall; the upgrade prompt appears when the draft is requested.
 *  - **The trial is the demo.** 14 days, no card, 5 AI quotes — and it includes
 *    the deposit collection and the follow-up nudges, even though those are Crew
 *    features on a paid plan. The trial exists to produce one accepted proposal
 *    with money attached; withholding the deposit step would remove the very
 *    thing that closes the sale.
 */

import type { Organization, Plan, SubscriptionStatus } from "@/db/schema";

export interface PlanFeatures {
  id: Plan;
  name: string;
  priceCents: number;
  /** AI-drafted quotes per billing period. */
  quoteLimit: number;
  /** Price-book size cap. */
  priceBookLimit: number;
  seats: number;
  /** Stripe Connect deposits on accepted proposals. */
  deposits: boolean;
  /** The +2d / +5d follow-up nudges. */
  nudges: boolean;
  blurb: string;
  /** What the tier adds, for the pricing table. */
  bullets: string[];
}

/** Fleet is "unlimited (fair use)": a real number, high enough to be invisible. */
const FLEET_FAIR_USE = 2_000;

export const PLANS: Record<Plan, PlanFeatures> = {
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 4_900,
    quoteLimit: 25,
    priceBookLimit: 300,
    seats: 1,
    deposits: false,
    nudges: false,
    blurb: "One user, 25 AI quotes a month, 300-item price book.",
    bullets: [
      "Walkthrough capture with photos",
      "AI drafting against your price book",
      "Branded proposal links + e-acceptance",
    ],
  },
  crew: {
    id: "crew",
    name: "Crew",
    priceCents: 9_900,
    quoteLimit: 100,
    priceBookLimit: 2_000,
    seats: 5,
    deposits: true,
    nudges: true,
    blurb: "Five users, 100 AI quotes a month, 2,000-item price book.",
    bullets: [
      "Everything in Solo",
      "Deposits via your own Stripe account",
      "Automatic +2 day and +5 day nudges",
    ],
  },
  fleet: {
    id: "fleet",
    name: "Fleet",
    priceCents: 19_900,
    quoteLimit: FLEET_FAIR_USE,
    priceBookLimit: Number.MAX_SAFE_INTEGER,
    seats: 15,
    deposits: true,
    nudges: true,
    blurb: "Fifteen users, unlimited quotes (fair use), unlimited price book.",
    bullets: ["Everything in Crew", "Unlimited price book", "Priority support"],
  },
};

export const PLAN_ORDER: Plan[] = ["solo", "crew", "fleet"];

export const TRIAL_DAYS = 14;
export const TRIAL_QUOTE_LIMIT = 5;

export function plan(id: Plan | string | null | undefined): PlanFeatures {
  return PLANS[(id ?? "solo") as Plan] ?? PLANS.solo;
}

export function formatPlanPrice(id: Plan): string {
  return `$${Math.round(plan(id).priceCents / 100)}/mo`;
}

/* ------------------------------------------------------------ org state --- */

/** The subset of an organization the gating functions need. */
export interface Gatable {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | string | null;
  quoteCountCurrentPeriod: number;
}

export function orgAsGatable(org: Organization): Gatable {
  return {
    plan: org.plan,
    subscriptionStatus: org.subscriptionStatus,
    trialEndsAt: org.trialEndsAt,
    quoteCountCurrentPeriod: org.quoteCountCurrentPeriod,
  };
}

export function isTrialing(org: Gatable): boolean {
  return org.subscriptionStatus === "trialing";
}

/** Was this org read-only *because the trial ran out*, rather than because of a bill? */
export function trialIsOver(org: Gatable, now = new Date()): boolean {
  if (org.subscriptionStatus === "trial_expired") return true;
  if (!isTrialing(org) || !org.trialEndsAt) return false;
  const ends = org.trialEndsAt instanceof Date ? org.trialEndsAt : new Date(org.trialEndsAt);
  return ends.getTime() <= now.getTime();
}

/** Days left in the trial, floor 0. Null when not trialing. */
export function trialDaysLeft(org: Gatable, now = new Date()): number | null {
  if (!isTrialing(org) || !org.trialEndsAt) return null;
  const ends = org.trialEndsAt instanceof Date ? org.trialEndsAt : new Date(org.trialEndsAt);
  const ms = ends.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Read-only: the trial ran out, or our own invoice failed and the grace period
 * passed. Sent proposals stay viewable and deposits still land — an unpaid bill
 * must not take a contractor's customers hostage — but nothing new gets drafted
 * or sent.
 */
export function isReadOnly(org: Gatable, now = new Date()): boolean {
  if (org.subscriptionStatus === "trial_expired" || org.subscriptionStatus === "canceled") {
    return true;
  }
  if (isTrialing(org) && org.trialEndsAt) {
    const ends = org.trialEndsAt instanceof Date ? org.trialEndsAt : new Date(org.trialEndsAt);
    if (ends.getTime() <= now.getTime()) return true;
  }
  return false;
}

export function quoteLimitFor(org: Gatable): number {
  return isTrialing(org) ? TRIAL_QUOTE_LIMIT : plan(org.plan).quoteLimit;
}

export function priceBookLimitFor(org: Gatable): number {
  // The trial gets the Solo cap: enough to import a real rate sheet.
  return isTrialing(org) ? PLANS.solo.priceBookLimit : plan(org.plan).priceBookLimit;
}

export type Feature = "deposits" | "nudges";

/** Trial includes the money features on purpose — see the file header. */
export function featureEnabled(org: Gatable, feature: Feature): boolean {
  if (isTrialing(org)) return true;
  return plan(org.plan)[feature];
}

/** The cheapest plan that carries a feature, for the upgrade prompt's copy. */
export function planRequiredFor(feature: Feature): Plan {
  return PLAN_ORDER.find((id) => PLANS[id][feature]) ?? "fleet";
}

export interface QuoteCapacity {
  limit: number;
  used: number;
  remaining: number
  atLimit: boolean;
  unlimitedish: boolean;
}

export function quoteCapacity(org: Gatable): QuoteCapacity {
  const limit = quoteLimitFor(org);
  const used = Math.max(0, org.quoteCountCurrentPeriod);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    atLimit: used >= limit,
    unlimitedish: limit >= FLEET_FAIR_USE,
  };
}

export type DraftGate =
  | { ok: true }
  | { ok: false; code: "PLAN_LIMIT"; message: string; upgradeTo: Plan | null }
  | { ok: false; code: "READ_ONLY"; message: string; upgradeTo: Plan | null };

/**
 * May this org draft another quote right now? Called before any AI spend.
 * The message is the copy the UI shows, so it names the number the contractor
 * hit and what to do about it.
 */
export function canDraft(org: Gatable, now = new Date()): DraftGate {
  if (isReadOnly(org, now)) {
    return {
      ok: false,
      code: "READ_ONLY",
      // The wording has to match the actual cause: a contractor whose trial ran
      // out has not failed to pay a bill, and telling them they have is a bad
      // first impression at exactly the wrong moment.
      message: trialIsOver(org, now)
        ? `Your ${TRIAL_DAYS}-day trial has ended. Pick a plan to draft new quotes — everything you have already sent stays live.`
        : "This account is read-only until billing is sorted. Sent proposals stay live and deposits still land.",
      upgradeTo: "crew",
    };
  }
  const capacity = quoteCapacity(org);
  if (capacity.atLimit) {
    const next = PLAN_ORDER.find((id) => PLANS[id].quoteLimit > capacity.limit) ?? null;
    return {
      ok: false,
      code: "PLAN_LIMIT",
      message: isTrialing(org)
        ? `Trials include ${TRIAL_QUOTE_LIMIT} AI quotes and you have used all ${TRIAL_QUOTE_LIMIT}. Pick a plan to keep drafting — your walkthrough is saved.`
        : `${plan(org.plan).name} includes ${capacity.limit} AI quotes a month and you have used all ${capacity.limit}. Your walkthrough is saved; upgrade to draft it.`,
      upgradeTo: next,
    };
  }
  return { ok: true };
}

export interface PriceBookCapacity {
  limit: number;
  used: number;
  remaining: number;
  atLimit: boolean;
  unlimited: boolean;
}

export function priceBookCapacity(org: Gatable, itemCount: number): PriceBookCapacity {
  const limit = priceBookLimitFor(org);
  const used = Math.max(0, itemCount);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    atLimit: used >= limit,
    unlimited: limit === Number.MAX_SAFE_INTEGER,
  };
}
