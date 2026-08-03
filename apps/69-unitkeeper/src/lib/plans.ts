/**
 * The plan catalog — one source of truth for the three tiers in README.md, and
 * one function that decides what an account may do *right now*.
 *
 * The meter is **units**, which is what a single-owner facility understands and
 * what the pricing table promises. Two things are deliberate:
 *
 *  - **Entitlement is derived from billing state, not from the plan column.** A
 *    subscription that cancelled is not a plan that keeps working; a 14-day trial
 *    that ended is not a trial. `entitlements()` reads the status and the dates
 *    and answers as of a moment, so nothing can quietly keep paid features for
 *    ever.
 *  - **A downgrade never deletes anything.** Units past the new cap go read-only
 *    and say why. Losing a tenancy record because a card expired would be worse
 *    than any billing problem.
 */

import type { Owner, Plan } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  priceMonthly: number;
  units: number;
  facilities: number;
  /** The lien timeline engine, notices and packet export. */
  lienEngine: boolean;
  /** Gate-code CSV export for keypad systems. */
  gateExports: boolean;
  blurb: string;
}

export const PLANS: Record<Plan, PlanSpec> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceMonthly: 0,
    units: 400,
    facilities: 3,
    lienEngine: true,
    gateExports: true,
    blurb: "14 days of everything, no card. Then pick the tier that fits your yard.",
  },
  keeper: {
    id: "keeper",
    name: "Keeper",
    priceMonthly: 59,
    units: 100,
    facilities: 1,
    lienEngine: false,
    gateExports: false,
    blurb: "Up to 100 units. The map, ten-minute move-ins, autopay and the late ladder.",
  },
  yard: {
    id: "yard",
    name: "Yard",
    priceMonthly: 99,
    units: 250,
    facilities: 1,
    lienEngine: true,
    gateExports: true,
    blurb: "Up to 250 units, the lien timeline engine with citations, and gate-code exports.",
  },
  depot: {
    id: "depot",
    name: "Depot",
    priceMonthly: 149,
    units: 400,
    facilities: 3,
    lienEngine: true,
    gateExports: true,
    blurb: "Up to 400 units across up to 3 facilities, and priority support.",
  },
};

export const PAID_PLANS: Plan[] = ["keeper", "yard", "depot"];
export const TRIAL_DAYS = 14;

/**
 * Stripe statuses that keep the doors open. `past_due` does: a failed card should
 * not lock an owner out of the ledger their lien sale depends on while they fix
 * it. `canceled`, `unpaid` and `incomplete_expired` do not.
 */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface Entitlements {
  /** The tier the account is being served at. */
  plan: Plan;
  spec: PlanSpec;
  /** True while the free trial is running. */
  trialing: boolean;
  trialDaysLeft: number;
  /**
   * True when nothing is paying and nothing is trialing: the console goes
   * read-only and every write path says why.
   */
  locked: boolean;
  lockReason: string | null;
  /** The card failed but access continues — shown as a banner, not a wall. */
  paymentProblem: boolean;
}

type BillingFacts = Pick<
  Owner,
  "plan" | "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd"
>;

export function entitlements(owner: BillingFacts, now: Date = new Date()): Entitlements {
  const plan = owner.plan ?? "trial";

  if (plan === "trial") {
    const endsAt = owner.trialEndsAt;
    const msLeft = endsAt ? endsAt.getTime() - now.getTime() : 0;
    const trialing = msLeft > 0;
    return {
      plan: "trial",
      spec: PLANS.trial,
      trialing,
      trialDaysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
      locked: !trialing,
      lockReason: trialing
        ? null
        : "Your 14-day trial has ended. Pick a plan to move in tenants, run autopay and generate notices. Everything already in the yard stays readable.",
      paymentProblem: false,
    };
  }

  const status = owner.subscriptionStatus ?? "active";
  const live = LIVE_STATUSES.has(status);
  return {
    plan,
    spec: PLANS[plan],
    trialing: false,
    trialDaysLeft: 0,
    locked: !live,
    lockReason: live
      ? null
      : `Your ${PLANS[plan].name} subscription is ${status.replace(/_/g, " ")}. The console is read-only until billing is current — your units, ledgers and lien files are untouched.`,
    paymentProblem: status === "past_due",
  };
}

/* ------------------------------------------------------------------ gates --- */

export interface Gate {
  allowed: boolean;
  reason?: string;
}

export function canAddUnit(ent: Entitlements, unitsUsed: number): Gate {
  if (ent.locked) return { allowed: false, reason: ent.lockReason ?? undefined };
  const limit = ent.spec.units;
  if (unitsUsed < limit) return { allowed: true };
  const next = nextPlanUp(ent.plan);
  return {
    allowed: false,
    reason: next
      ? `${ent.spec.name} covers ${limit} units. ${PLANS[next].name} covers ${PLANS[next].units} for $${PLANS[next].priceMonthly}/mo.`
      : `Depot covers 400 units, the most UnitKeeper is built for. Above that you want facility software with a sales call, and we will say so.`,
  };
}

export function canAddFacility(ent: Entitlements, facilitiesUsed: number): Gate {
  if (ent.locked) return { allowed: false, reason: ent.lockReason ?? undefined };
  const limit = ent.spec.facilities;
  if (facilitiesUsed < limit) return { allowed: true };
  return {
    allowed: false,
    reason:
      limit === 1
        ? `${ent.spec.name} covers one facility. Depot covers 3 for $${PLANS.depot.priceMonthly}/mo.`
        : `${ent.spec.name} covers ${limit} facilities.`,
  };
}

export function canUseLienEngine(ent: Entitlements): Gate {
  if (ent.locked) return { allowed: false, reason: ent.lockReason ?? undefined };
  if (ent.spec.lienEngine) return { allowed: true };
  return {
    allowed: false,
    reason: `The lien timeline engine is on Yard ($${PLANS.yard.priceMonthly}/mo) and Depot. Keeper tracks the delinquency; it does not compute the statutory clock.`,
  };
}

export function canExportGateCodes(ent: Entitlements): Gate {
  if (ent.locked) return { allowed: false, reason: ent.lockReason ?? undefined };
  if (ent.spec.gateExports) return { allowed: true };
  return {
    allowed: false,
    reason: `Keypad CSV export is on Yard ($${PLANS.yard.priceMonthly}/mo) and Depot.`,
  };
}

export function nextPlanUp(plan: Plan): Plan | null {
  const i = PAID_PLANS.indexOf(plan);
  if (plan === "trial") return "keeper";
  return i >= 0 && i < PAID_PLANS.length - 1 ? PAID_PLANS[i + 1] : null;
}

/** The smallest paid plan that covers this many units. */
export function planForUnits(units: number): Plan {
  return PAID_PLANS.find((id) => PLANS[id].units >= units) ?? "depot";
}

/** Where a Stripe price id lands. Anything unrecognised falls to the entry tier. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { keeper: string; yard: string; depot: string },
): Plan {
  if (!priceId) return "keeper";
  if (priceId && priceId === prices.depot) return "depot";
  if (priceId && priceId === prices.yard) return "yard";
  return "keeper";
}

/**
 * The units past the cap after a downgrade, oldest-first order in, read-only list
 * out. They are never deleted and never unlinked from their ledger.
 */
export function overflowUnits<T>(ent: Entitlements, unitsOldestFirst: readonly T[]): T[] {
  const limit = ent.spec.units;
  return unitsOldestFirst.length <= limit ? [] : unitsOldestFirst.slice(limit);
}
