/**
 * src/lib/plans.ts
 *
 * The three plans from README.md's pricing table, plus the trial and what
 * happens when it or a subscription lapses.
 *
 * The anti-lock-in promise on the pricing page is load-bearing: a read-only
 * carrier can still export every record. Read-only means "cannot create new
 * work", never "cannot get your data out".
 *
 * Pure — no database, no environment. Safe in a client component.
 */

import type { Carrier } from "@/db/schema";

export type PlanId = "trial" | "solo" | "team" | "fleet";

export interface Plan {
  id: PlanId;
  name: string;
  priceCents: number;
  trucks: number;
  /** Seats besides the owner: dispatchers and drivers. */
  extraSeats: number;
  factoringExports: boolean;
  perTruckSettlement: boolean;
  blurb: string;
}

export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceCents: 0,
    // The trial is the whole product for 14 days: gating a trial down to the
    // cheapest tier is how a trial fails to sell the expensive tier.
    trucks: 5,
    extraSeats: 4,
    factoringExports: true,
    perTruckSettlement: true,
    blurb: "Everything, 14 days, no card.",
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 4_900,
    trucks: 1,
    extraSeats: 0,
    factoringExports: false,
    perTruckSettlement: false,
    blurb: "1 truck. Loads, packets, detention, IFTA.",
  },
  team: {
    id: "team",
    name: "Team",
    priceCents: 9_900,
    trucks: 3,
    extraSeats: 1,
    factoringExports: true,
    perTruckSettlement: false,
    blurb: "Up to 3 trucks, dispatcher seat, factoring exports.",
  },
  fleet: {
    id: "fleet",
    name: "Fleet",
    priceCents: 14_900,
    trucks: 5,
    extraSeats: 4,
    factoringExports: true,
    perTruckSettlement: true,
    blurb: "Up to 5 trucks, driver seats, settlement per truck.",
  },
};

export const PAID_PLANS: Plan[] = [PLANS.solo, PLANS.team, PLANS.fleet];

/** Days of grace after a failed payment before the account goes read-only. */
export const DUNNING_GRACE_DAYS = 7;

export interface PlanState {
  plan: Plan;
  trialing: boolean;
  /** Days left in the trial, floor 0. Null when not trialing. */
  trialDaysLeft: number | null;
  /** True when new work is blocked. Exports and reads always stay open. */
  readOnly: boolean;
  /** Why, in the words the settings screen shows. Null when fine. */
  readOnlyReason: string | null;
  pastDue: boolean;
}

type PlanCarrier = Pick<Carrier, "plan" | "trialEndsAt" | "settings">;

export function planState(carrier: PlanCarrier, now: Date = new Date()): PlanState {
  const plan = PLANS[carrier.plan] ?? PLANS.trial;
  const trialing = carrier.plan === "trial";
  const trialEnds = carrier.trialEndsAt ? new Date(carrier.trialEndsAt) : null;
  const trialDaysLeft = trialing && trialEnds ? daysBetween(now, trialEnds) : null;

  if (trialing) {
    const expired = trialEnds !== null && trialEnds.getTime() <= now.getTime();
    return {
      plan,
      trialing: true,
      trialDaysLeft: trialDaysLeft === null ? null : Math.max(0, trialDaysLeft),
      readOnly: expired,
      readOnlyReason: expired
        ? "Your 14-day trial has ended. Pick a plan to book new loads — your existing records and every export stay open."
        : null,
      pastDue: false,
    };
  }

  const status = carrier.settings?.subscriptionStatus ?? "active";
  const pastDue = status === "past_due" || status === "unpaid" || status === "incomplete";
  if (pastDue) {
    const since = carrier.settings?.pastDueSince ? new Date(carrier.settings.pastDueSince) : null;
    const graceLeft = since ? DUNNING_GRACE_DAYS - daysSince(since, now) : DUNNING_GRACE_DAYS;
    const expired = graceLeft <= 0;
    return {
      plan,
      trialing: false,
      trialDaysLeft: null,
      readOnly: expired,
      readOnlyReason: expired
        ? "The last payment failed and the grace period is up. Update your card to book new loads — exports stay open."
        : null,
      pastDue: true,
    };
  }

  if (status === "canceled") {
    return {
      plan,
      trialing: false,
      trialDaysLeft: null,
      readOnly: true,
      readOnlyReason:
        "This subscription was cancelled. Everything you recorded is still here and still exportable.",
      pastDue: false,
    };
  }

  return { plan, trialing: false, trialDaysLeft: null, readOnly: false, readOnlyReason: null, pastDue: false };
}

function daysBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
}

function daysSince(from: Date, now: Date): number {
  return Math.floor((now.getTime() - from.getTime()) / 86_400_000);
}

export interface LimitCheck {
  ok: boolean;
  /** The sentence shown next to the disabled control. */
  reason: string | null;
  used: number;
  limit: number;
}

export function checkTruckLimit(state: PlanState, activeTrucks: number): LimitCheck {
  const limit = state.plan.trucks;
  if (activeTrucks < limit) return { ok: true, reason: null, used: activeTrucks, limit };
  return {
    ok: false,
    reason:
      state.plan.id === "fleet"
        ? `Fleet covers 5 trucks and you have ${activeTrucks}. Six trucks is past what this product is built for — talk to us.`
        : `${state.plan.name} covers ${limit} truck${limit === 1 ? "" : "s"}. Upgrade to add another.`,
    used: activeTrucks,
    limit,
  };
}

export function checkSeatLimit(state: PlanState, extraUsers: number): LimitCheck {
  const limit = state.plan.extraSeats;
  if (extraUsers < limit) return { ok: true, reason: null, used: extraUsers, limit };
  return {
    ok: false,
    reason:
      limit === 0
        ? `${state.plan.name} is a single seat — you. Team adds a dispatcher; Fleet adds driver seats.`
        : `${state.plan.name} includes ${limit} extra seat${limit === 1 ? "" : "s"}. Upgrade for more.`,
    used: extraUsers,
    limit,
  };
}

export function canExportFactoring(state: PlanState): LimitCheck {
  if (state.plan.factoringExports) return { ok: true, reason: null, used: 0, limit: 0 };
  return {
    ok: false,
    reason: "Schedule-of-accounts exports are on Team and Fleet. Solo can still mark loads factored.",
    used: 0,
    limit: 0,
  };
}

/** What the price reads as on the pricing table: "$49" with no trailing zeros. */
export function planPriceLabel(plan: Plan): string {
  return `$${Math.round(plan.priceCents / 100)}`;
}
