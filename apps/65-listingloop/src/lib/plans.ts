/**
 * src/lib/plans.ts
 *
 * The three plans from README.md, plus the trial. Pure: no db, no Stripe, so the
 * pricing table, the gate checks and the tests all read the same numbers.
 *
 * "Closed deals never count against limits" is the load-bearing rule — a TC who
 * closes forty files a year should never be asked to delete history to open the
 * forty-first — so the limit is counted over open statuses only.
 */

import type { DealStatus, Plan } from "@/db/schema";

export const TRIAL_DAYS = 14;

/** Statuses that consume a seat on the plan's active-deal limit. */
export const OPEN_STATUSES: readonly DealStatus[] = [
  "active",
  "pending_items",
  "clear_to_close",
] as const;

export interface PlanSpec {
  id: Plan;
  name: string;
  priceCents: number;
  blurb: string;
  /** Active (non-closed) deals. Infinity = unlimited. */
  activeDeals: number;
  users: number;
  customTemplates: boolean;
  partyPortal: boolean;
  /** Pipeline commission totals by month of expected close. */
  commissionReports: boolean;
  features: string[];
}

export const PLANS: Record<Plan, PlanSpec> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceCents: 0,
    blurb: "14 days, no card. Everything Office does, so nothing is a surprise later.",
    activeDeals: 30,
    users: 5,
    customTemplates: true,
    partyPortal: true,
    commissionReports: true,
    features: [
      "Every feature unlocked for 14 days",
      "Up to 30 active files",
      "No card, no cancellation to remember",
    ],
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 3900,
    blurb: "For the producing agent who coordinates their own files.",
    activeDeals: 10,
    users: 1,
    customTemplates: false,
    partyPortal: false,
    commissionReports: false,
    features: [
      "Up to 10 active files",
      "The critical-date engine and diff-preview recompute",
      "Reminder fan-out to every party",
      "The three starter checklists",
    ],
  },
  desk: {
    id: "desk",
    name: "Desk",
    priceCents: 6900,
    blurb: "For the independent TC running a full desk.",
    activeDeals: 30,
    users: 1,
    customTemplates: true,
    partyPortal: true,
    commissionReports: false,
    features: [
      "Up to 30 active files",
      "Your own checklist templates and date rules",
      "Party portal links and document requests",
      "Everything in Solo",
    ],
  },
  office: {
    id: "office",
    name: "Office",
    priceCents: 9900,
    blurb: "For a brokerage standardising across agents.",
    activeDeals: Number.POSITIVE_INFINITY,
    users: 5,
    customTemplates: true,
    partyPortal: true,
    commissionReports: true,
    features: [
      "Unlimited active files",
      "5 users",
      "Commission pipeline by month of expected close",
      "Everything in Desk",
    ],
  },
};

export const PAID_PLANS: readonly Plan[] = ["solo", "desk", "office"] as const;

export function planSpec(plan: Plan): PlanSpec {
  return PLANS[plan] ?? PLANS.trial;
}

export function formatPlanPrice(plan: Plan): string {
  const spec = planSpec(plan);
  return spec.priceCents === 0 ? "Free" : `$${Math.round(spec.priceCents / 100)}/mo`;
}

/* ------------------------------------------------------------------- gating */

export interface AccountState {
  plan: Plan;
  trialEndsAt: Date | null;
}

/**
 * A trial that ran out is read-only until a plan is chosen.
 *
 * A `trial` plan with NO deadline counts as expired, not as unlimited. Signup
 * always writes one, so the only way to reach that state is to have consumed a
 * trial and then lost the date — which is exactly what a cancelled subscription
 * used to do: `plan` fell back to `trial`, `trialEndsAt` was already null from
 * the upgrade, and the desk stayed fully writable forever. Caught by exercising
 * the cancellation path against the real database, not by reading the code.
 */
export function trialExpired(account: AccountState, now: Date = new Date()): boolean {
  if (account.plan !== "trial") return false;
  if (!account.trialEndsAt) return true;
  return account.trialEndsAt.getTime() <= now.getTime();
}

export function trialDaysLeft(account: AccountState, now: Date = new Date()): number {
  if (account.plan !== "trial" || !account.trialEndsAt) return 0;
  const ms = account.trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export type Gate = { allowed: true } | { allowed: false; reason: string };

const ALLOWED: Gate = { allowed: true };

/**
 * Can this account open one more file? A hard limit that blocks a coordinator
 * mid-transaction would be worse than the overage, so the message always names
 * the number and the next plan up.
 */
export function canOpenDeal(
  account: AccountState,
  openDealCount: number,
  now: Date = new Date(),
): Gate {
  if (trialExpired(account, now)) {
    return {
      allowed: false,
      reason: "Your trial has ended. Choose a plan to open new files — exports stay available.",
    };
  }
  const spec = planSpec(account.plan);
  if (openDealCount >= spec.activeDeals) {
    const next = account.plan === "solo" ? "Desk" : "Office";
    return {
      allowed: false,
      reason: `${spec.name} covers ${spec.activeDeals} active files and you have ${openDealCount}. Closed files never count — upgrade to ${next} for more.`,
    };
  }
  return ALLOWED;
}

export function canEditTemplates(account: AccountState, now: Date = new Date()): Gate {
  if (trialExpired(account, now)) {
    return { allowed: false, reason: "Your trial has ended. Choose a plan to edit templates." };
  }
  if (!planSpec(account.plan).customTemplates) {
    return {
      allowed: false,
      reason: "Editing checklist templates is on Desk and Office. Solo uses the three starter checklists.",
    };
  }
  return ALLOWED;
}

export function canUsePartyPortal(account: AccountState, now: Date = new Date()): Gate {
  if (trialExpired(account, now)) {
    return { allowed: false, reason: "Your trial has ended. Choose a plan to send portal links." };
  }
  if (!planSpec(account.plan).partyPortal) {
    return {
      allowed: false,
      reason: "Party portal links are on Desk and Office.",
    };
  }
  return ALLOWED;
}

export function canSeeCommissionReports(account: AccountState, now: Date = new Date()): Gate {
  if (trialExpired(account, now)) {
    return { allowed: false, reason: "Your trial has ended. Choose a plan to see pipeline totals." };
  }
  if (!planSpec(account.plan).commissionReports) {
    return {
      allowed: false,
      reason: "Pipeline totals by month are on Office. Per-file commission math is on every plan.",
    };
  }
  return ALLOWED;
}

/**
 * Read-only mode. A lapsed account keeps its file and can still export it —
 * anti-lock-in is a promise in the README, and holding a coordinator's closing
 * packet hostage would break it.
 */
export function isReadOnly(account: AccountState, now: Date = new Date()): boolean {
  return trialExpired(account, now);
}
