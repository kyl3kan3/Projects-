/**
 * Plans and entitlements.
 *
 * The meter is **APIs watched** — flat per tier, never per-seat (the whole team
 * should see alerts) and never per-request (README, Monetization). Everything
 * here is pure so the gate can be unit-tested without a database; the call
 * sites are `pushSpec` (at push time, per ROADMAP: "Billing gates API count at
 * push time with a clear upgrade path — no silent drops") and the dashboard's
 * "Add API" action.
 *
 * A trial is deliberately generous — Team entitlements — because the product
 * sells on the first prevented incident and a crippled trial cannot produce
 * one. When it lapses the org is not silently downgraded: pushes are refused
 * with a message naming the plan to pick.
 */

import type { Plan } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  /** Monthly price in integer cents. Money is never a float here. */
  priceCents: number;
  apiLimit: number;
  historyDays: number;
  contractTests: boolean;
  consumerRegistry: boolean;
  policyOverrides: boolean;
  sso: boolean;
  auditLog: boolean;
  blurb: string;
}

export const PLANS: Record<Plan, PlanSpec> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceCents: 0,
    apiLimit: 5,
    historyDays: 365,
    contractTests: true,
    consumerRegistry: true,
    policyOverrides: true,
    sso: false,
    auditLog: true,
    blurb: "14 days of everything on Team. No card.",
  },
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 4900,
    apiLimit: 1,
    historyDays: 90,
    contractTests: false,
    consumerRegistry: false,
    policyOverrides: false,
    sso: false,
    auditLog: false,
    blurb: "One API, CI check and Slack alerts, 90-day history, public changelog.",
  },
  team: {
    id: "team",
    name: "Team",
    priceCents: 9900,
    apiLimit: 5,
    historyDays: 365,
    contractTests: true,
    consumerRegistry: true,
    policyOverrides: true,
    sso: false,
    auditLog: true,
    blurb: "Five APIs, contract tests, consumer registry, custom policy, 1-year history.",
  },
  platform: {
    id: "platform",
    name: "Platform",
    priceCents: 19900,
    apiLimit: 15,
    historyDays: 3650,
    contractTests: true,
    consumerRegistry: true,
    policyOverrides: true,
    sso: true,
    auditLog: true,
    blurb: "Fifteen APIs, SSO, API access, audit log, priority support.",
  },
};

export const PAID_PLANS: Plan[] = ["solo", "team", "platform"];

export const TRIAL_DAYS = 14;

/** `$99` / `$0`. Cents in, display string out — rounded once, at the edge. */
export function formatPrice(cents: number): string {
  if (cents === 0) return "$0";
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export interface OrgPlanState {
  plan: Plan;
  trialEndsAt: Date | null;
  /** Count of APIs already watched. */
  apiCount: number;
}

export type GateReason = "ok" | "trial-expired" | "api-limit" | "feature-not-in-plan";

export interface GateResult {
  allowed: boolean;
  reason: GateReason;
  /** Sentence shown to the user or returned to the CLI. Never blank. */
  message: string;
  /** The cheapest plan that would allow the action, when one exists. */
  upgradeTo: Plan | null;
}

const ok: GateResult = { allowed: true, reason: "ok", message: "", upgradeTo: null };

export function trialExpired(state: OrgPlanState, now: Date): boolean {
  if (state.plan !== "trial") return false;
  if (!state.trialEndsAt) return false;
  return state.trialEndsAt.getTime() <= now.getTime();
}

export function trialDaysLeft(state: OrgPlanState, now: Date): number | null {
  if (state.plan !== "trial" || !state.trialEndsAt) return null;
  const ms = state.trialEndsAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** The cheapest paid plan that can watch this many APIs. */
export function planForApiCount(count: number): Plan | null {
  for (const id of PAID_PLANS) {
    if (PLANS[id].apiLimit >= count) return id;
  }
  return null;
}

/**
 * May this organization register one more API? Called before creating an API
 * and again at push time, because a plan can lapse between the two.
 */
export function canAddApi(state: OrgPlanState, now: Date): GateResult {
  if (trialExpired(state, now)) {
    return {
      allowed: false,
      reason: "trial-expired",
      message: `Your 14-day trial has ended. Choose a plan to keep watching ${state.apiCount === 1 ? "your API" : "your APIs"}.`,
      upgradeTo: planForApiCount(Math.max(1, state.apiCount)) ?? "platform",
    };
  }
  const limit = PLANS[state.plan].apiLimit;
  if (state.apiCount >= limit) {
    const next = planForApiCount(state.apiCount + 1);
    return {
      allowed: false,
      reason: "api-limit",
      message: next
        ? `${PLANS[state.plan].name} watches ${limit} API${limit === 1 ? "" : "s"}. ${PLANS[next].name} watches ${PLANS[next].apiLimit} for ${formatPrice(PLANS[next].priceCents)}/mo.`
        : `${PLANS[state.plan].name} watches ${limit} APIs, the most any self-serve plan covers. Get in touch and we will size something.`,
      upgradeTo: next,
    };
  }
  return ok;
}

/**
 * May this organization push a spec for an API it already registered? Existing
 * APIs keep working within the plan's limit; over-limit APIs are refused by
 * name rather than dropped silently.
 */
export function canPush(state: OrgPlanState, now: Date, apiRank: number): GateResult {
  if (trialExpired(state, now)) {
    return {
      allowed: false,
      reason: "trial-expired",
      message: "Your 14-day trial has ended, so this push was not recorded. Choose a plan and re-run your pipeline.",
      upgradeTo: planForApiCount(Math.max(1, state.apiCount)) ?? "platform",
    };
  }
  const limit = PLANS[state.plan].apiLimit;
  if (apiRank > limit) {
    const next = planForApiCount(apiRank);
    return {
      allowed: false,
      reason: "api-limit",
      message: next
        ? `This is API #${apiRank}, and ${PLANS[state.plan].name} covers ${limit}. Nothing was recorded — upgrade to ${PLANS[next].name} (${formatPrice(PLANS[next].priceCents)}/mo) and re-run.`
        : `This is API #${apiRank}, beyond every self-serve plan. Nothing was recorded — get in touch.`,
      upgradeTo: next,
    };
  }
  return ok;
}

export type GatedFeature = "contractTests" | "consumerRegistry" | "policyOverrides" | "sso" | "auditLog";

const FEATURE_LABELS: Record<GatedFeature, string> = {
  contractTests: "Contract-test generation",
  consumerRegistry: "The consumer registry",
  policyOverrides: "Custom breaking-change policy",
  sso: "SSO",
  auditLog: "The audit log",
};

export function canUse(state: OrgPlanState, now: Date, feature: GatedFeature): GateResult {
  if (trialExpired(state, now)) {
    return {
      allowed: false,
      reason: "trial-expired",
      message: "Your 14-day trial has ended. Choose a plan to carry on.",
      upgradeTo: "team",
    };
  }
  if (PLANS[state.plan][feature]) return ok;
  const next = PAID_PLANS.find((p) => PLANS[p][feature]) ?? null;
  return {
    allowed: false,
    reason: "feature-not-in-plan",
    message: next
      ? `${FEATURE_LABELS[feature]} is on ${PLANS[next].name} (${formatPrice(PLANS[next].priceCents)}/mo) and above.`
      : `${FEATURE_LABELS[feature]} is not available on any self-serve plan yet.`,
    upgradeTo: next,
  };
}

/** History cutoff for the timeline — older deploys are hidden, never deleted. */
export function historyCutoff(plan: Plan, now: Date): Date {
  return new Date(now.getTime() - PLANS[plan].historyDays * 86_400_000);
}
