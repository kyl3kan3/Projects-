/**
 * src/lib/plans.ts
 *
 * RigRent's own three tiers from README.md, and one function that decides what
 * an account may do *right now*.
 *
 * Two decisions worth stating:
 *
 *  - **Entitlement is derived from billing state, never read off the plan
 *    column.** A subscription that cancelled is not a plan that keeps working,
 *    and a 14-day trial that ended is not a trial. `entitlements()` reads the
 *    status and the dates and answers as of a moment, so nothing quietly keeps
 *    paid features for ever.
 *  - **A downgrade never deletes anything.** Past the seat cap, extra users stop
 *    being able to sign in to write; every order, photo and claim stays exactly
 *    where it was. Losing a damage claim because a card expired would be worse
 *    than any billing problem.
 */

import type { Account, Plan } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  priceMonthly: number;
  /** Staff seats. Infinity on Pro. */
  users: number;
  /** Delivery/pickup runs, load lists, driver check-off. */
  runs: boolean;
  /** Damage claims and deposit capture. */
  damageClaims: boolean;
  /** Per-unit serial tracking. */
  serials: boolean;
  /** Maintenance holds that subtract from availability. */
  maintenanceHolds: boolean;
  blurb: string;
}

export const PLANS: Record<Plan, PlanSpec> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceMonthly: 0,
    users: 10,
    runs: true,
    damageClaims: true,
    serials: true,
    maintenanceHolds: true,
    blurb: "14 days of everything, no card. Then pick the tier that fits the yard.",
  },
  yard: {
    id: "yard",
    name: "Yard",
    priceMonthly: 79,
    users: 2,
    runs: false,
    damageClaims: false,
    serials: false,
    maintenanceHolds: false,
    blurb: "One location, two users, unlimited orders. Inventory, quotes, contracts and deposit holds.",
  },
  fleet: {
    id: "fleet",
    name: "Fleet",
    priceMonthly: 129,
    users: 5,
    runs: true,
    damageClaims: true,
    serials: false,
    maintenanceHolds: false,
    blurb: "Five users, delivery runs with load lists and driver check-off, and damage claims against the deposit.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 199,
    users: Number.POSITIVE_INFINITY,
    runs: true,
    damageClaims: true,
    serials: true,
    maintenanceHolds: true,
    blurb: "Unlimited users, per-unit serials, maintenance holds, priority support.",
  },
};

export const PAID_PLANS: Plan[] = ["yard", "fleet", "pro"];
export const TRIAL_DAYS = 14;

/**
 * Stripe statuses that keep the yard working. `past_due` does: a failed card
 * should not lock a shop out of the run sheet for tomorrow's wedding while they
 * fix it. `canceled`, `unpaid` and `incomplete_expired` do not.
 */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface Entitlements {
  plan: Plan;
  spec: PlanSpec;
  trialing: boolean;
  trialDaysLeft: number;
  /** Nothing paying and nothing trialing: the app goes read-only and says why. */
  locked: boolean;
  lockReason: string | null;
  /** The card failed but access continues — a banner, not a wall. */
  paymentProblem: boolean;
}

type BillingFacts = Pick<
  Account,
  "plan" | "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd"
>;

export function entitlements(account: BillingFacts, now: Date = new Date()): Entitlements {
  const plan = account.plan ?? "trial";

  if (plan === "trial") {
    const msLeft = account.trialEndsAt ? account.trialEndsAt.getTime() - now.getTime() : 0;
    const trialing = msLeft > 0;
    return {
      plan: "trial",
      spec: PLANS.trial,
      trialing,
      trialDaysLeft: Math.max(0, Math.ceil(msLeft / 86_400_000)),
      locked: !trialing,
      lockReason: trialing
        ? null
        : "Your 14-day trial has ended. Pick a plan to send quotes, hold deposits and plan runs. Everything already in the yard stays readable, and exports keep working.",
      paymentProblem: false,
    };
  }

  const status = account.subscriptionStatus ?? "active";
  const live = LIVE_STATUSES.has(status);
  return {
    plan,
    spec: PLANS[plan],
    trialing: false,
    trialDaysLeft: 0,
    locked: !live,
    lockReason: live
      ? null
      : `Your ${PLANS[plan].name} subscription is ${status.replace(/_/g, " ")}. RigRent is read-only until billing is current — your inventory, orders, photos and claims are untouched.`,
    paymentProblem: status === "past_due",
  };
}

/* ------------------------------------------------------------------ gates --- */

export interface Gate {
  allowed: boolean;
  reason?: string;
}

const allow: Gate = { allowed: true };

function upgradeTo(plan: Plan, what: string): Gate {
  return {
    allowed: false,
    reason: `${what} is on ${PLANS[plan].name} ($${PLANS[plan].priceMonthly}/mo) and above.`,
  };
}

export function canWrite(ent: Entitlements): Gate {
  return ent.locked ? { allowed: false, reason: ent.lockReason ?? undefined } : allow;
}

export function canAddUser(ent: Entitlements, usersUsed: number): Gate {
  const write = canWrite(ent);
  if (!write.allowed) return write;
  if (usersUsed < ent.spec.users) return allow;
  const next = nextPlanUp(ent.plan);
  return {
    allowed: false,
    reason: next
      ? `${ent.spec.name} covers ${ent.spec.users} users. ${PLANS[next].name} covers ${PLANS[next].users === Number.POSITIVE_INFINITY ? "unlimited" : PLANS[next].users} for $${PLANS[next].priceMonthly}/mo.`
      : `${ent.spec.name} already covers unlimited users.`,
  };
}

export function canUseRuns(ent: Entitlements): Gate {
  const write = canWrite(ent);
  if (!write.allowed) return write;
  return ent.spec.runs ? allow : upgradeTo("fleet", "Delivery and pickup runs");
}

export function canUseDamageClaims(ent: Entitlements): Gate {
  const write = canWrite(ent);
  if (!write.allowed) return write;
  return ent.spec.damageClaims ? allow : upgradeTo("fleet", "Damage claims against the deposit");
}

export function canUseSerials(ent: Entitlements): Gate {
  const write = canWrite(ent);
  if (!write.allowed) return write;
  return ent.spec.serials ? allow : upgradeTo("pro", "Per-unit serial tracking");
}

export function canUseMaintenanceHolds(ent: Entitlements): Gate {
  const write = canWrite(ent);
  if (!write.allowed) return write;
  return ent.spec.maintenanceHolds ? allow : upgradeTo("pro", "Maintenance holds");
}

export function nextPlanUp(plan: Plan): Plan | null {
  if (plan === "trial") return "yard";
  const i = PAID_PLANS.indexOf(plan);
  return i >= 0 && i < PAID_PLANS.length - 1 ? PAID_PLANS[i + 1] : null;
}

/** Where a Stripe price id lands. Anything unrecognised falls to the entry tier. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { yard: string; fleet: string; pro: string },
): Plan {
  if (!priceId) return "yard";
  if (prices.pro && priceId === prices.pro) return "pro";
  if (prices.fleet && priceId === prices.fleet) return "fleet";
  return "yard";
}

/** Users past the cap after a downgrade, newest-first order in, read-only list out. */
export function overflowUsers<T>(ent: Entitlements, usersOldestFirst: readonly T[]): T[] {
  const limit = ent.spec.users;
  if (!Number.isFinite(limit)) return [];
  return usersOldestFirst.length <= limit ? [] : usersOldestFirst.slice(limit);
}
