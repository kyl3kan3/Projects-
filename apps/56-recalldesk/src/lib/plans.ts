/**
 * src/lib/plans.ts
 *
 * The three plans from README's pricing table, priced per location, and the
 * gates that follow from them. Pure — no database, no Stripe — so the gate can be
 * tested and so a client component can render the pricing table.
 */

export type Plan = "chairside" | "recall_engine" | "group";

export const PLANS: Plan[] = ["chairside", "recall_engine", "group"];

export interface PlanSpec {
  id: Plan;
  name: string;
  /** Per location, per month, in cents. */
  priceCents: number;
  tagline: string;
  /** Minimum locations the plan is sold in (Group is a 3+ price). */
  minLocations: number;
  features: string[];
  /** SMS campaign steps. Chairside is email-only. */
  sms: boolean;
  /** Cross-location roll-up dashboard and owner reports. */
  multiLocation: boolean;
  /** Steps a single campaign sequence may contain. */
  maxSequenceSteps: number;
}

export const TRIAL_DAYS = 14;

export const PLAN_SPECS: Record<Plan, PlanSpec> = {
  chairside: {
    id: "chairside",
    name: "Chairside",
    priceCents: 19_900,
    tagline: "The overdue list, email campaigns, the queue, the ledger.",
    minLocations: 1,
    sms: false,
    multiLocation: false,
    maxSequenceSteps: 2,
    features: [
      "CSV import from any PMS, with per-PMS export recipes",
      "Overdue engine with per-patient recall intervals",
      "Email campaigns with tokenized booking links",
      "The daily front-desk call queue",
      "Conservative attribution ledger with receipts",
    ],
  },
  recall_engine: {
    id: "recall_engine",
    name: "Recall Engine",
    priceCents: 29_900,
    tagline: "Adds SMS, multi-step sequences, and the monthly owner report.",
    minLocations: 1,
    sms: true,
    multiLocation: false,
    maxSequenceSteps: 4,
    features: [
      "Everything in Chairside",
      "SMS campaign steps (10DLC, consent enforced)",
      "Multi-step sequences with quiet hours and touch caps",
      "Monthly owner report (PDF) with holdout comparison",
    ],
  },
  group: {
    id: "group",
    name: "Group",
    priceCents: 49_900,
    tagline: "Every location on one screen, benchmarked against each other.",
    minLocations: 3,
    sms: true,
    multiLocation: true,
    maxSequenceSteps: 6,
    features: [
      "Everything in Recall Engine",
      "Cross-location dashboard and per-location benchmarks",
      "Roll-up owner reports",
      "Priority support and onboarding",
    ],
  },
};

export function planSpec(plan: Plan): PlanSpec {
  return PLAN_SPECS[plan];
}

export function planName(plan: Plan): string {
  return PLAN_SPECS[plan].name;
}

/** Monthly bill for a plan at a location count, in cents. */
export function monthlyCents(plan: Plan, locations: number): number {
  return PLAN_SPECS[plan].priceCents * Math.max(1, Math.floor(locations));
}

export type Denial =
  | { ok: true }
  | { ok: false; reason: string; upgradeTo: Plan | null };

const ALLOW: Denial = { ok: true };

/**
 * Is a channel available on this plan? SMS is the Recall Engine's headline
 * feature; on Chairside an SMS step cannot be added to a sequence at all, rather
 * than being added and silently skipped at send time.
 */
export function channelAllowed(plan: Plan, channel: "email" | "sms" | "call"): Denial {
  if (channel !== "sms") return ALLOW;
  if (PLAN_SPECS[plan].sms) return ALLOW;
  return {
    ok: false,
    reason: "SMS steps are part of Recall Engine. Email steps are available on Chairside.",
    upgradeTo: "recall_engine",
  };
}

/** Sequence length cap, so a plan cannot be out-engineered with 12 steps. */
export function sequenceLengthAllowed(plan: Plan, steps: number): Denial {
  const max = PLAN_SPECS[plan].maxSequenceSteps;
  if (steps <= max) return ALLOW;
  const upgradeTo: Plan | null =
    plan === "chairside" ? "recall_engine" : plan === "recall_engine" ? "group" : null;
  return {
    ok: false,
    reason: `${planName(plan)} sequences run up to ${max} steps.`,
    upgradeTo,
  };
}

/** Adding a location. Chairside and Recall Engine are per-location, uncapped. */
export function locationAllowed(plan: Plan, existing: number): Denial {
  if (plan === "group" || existing < 3) return ALLOW;
  return {
    ok: false,
    reason:
      "Three or more locations are priced on Group, which also gives you the cross-location dashboard.",
    upgradeTo: "group",
  };
}

/** Is the trial still running? */
export function trialActive(trialEndsAt: Date | null, now: Date = new Date()): boolean {
  return Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime());
}

export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000));
}

/**
 * Can this practice send campaign touches at all?
 *
 * A lapsed trial with no subscription pauses **sending**, never reading: the
 * roster, the overdue list and the ledger stay fully readable. Holding a
 * practice's own patient data hostage over a card failure is not a growth tactic
 * we are running (README: "the roster and ledger stay readable").
 */
export function sendingAllowed(practice: {
  plan: Plan;
  stripeSubscriptionId: string | null;
  trialEndsAt: Date | null;
  subscriptionStatus?: string | null;
}, now: Date = new Date()): Denial {
  if (practice.stripeSubscriptionId) {
    const status = practice.subscriptionStatus ?? "active";
    if (status === "canceled" || status === "unpaid") {
      return {
        ok: false,
        reason: "Campaign sending is paused because the subscription is not active. Your roster and ledger are unaffected.",
        upgradeTo: null,
      };
    }
    return ALLOW;
  }
  if (trialActive(practice.trialEndsAt, now)) return ALLOW;
  return {
    ok: false,
    reason: "Your 14-day trial has ended. Start a subscription to send campaign touches — the overdue list and ledger stay open.",
    upgradeTo: practice.plan,
  };
}
