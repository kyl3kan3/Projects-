/**
 * Plan catalog — the single source of truth for tiers, volume caps, and feature
 * gates. Mirrors the pricing table in README.md. Prices are display-only;
 * billable Stripe price IDs live in env.
 *
 * The hard rule this file exists to protect: volume caps are **soft**. They
 * drive banners and upgrade prompts and nothing else. A blocked waiver at a
 * busy counter is the one unforgivable failure, so nothing here is ever
 * consulted by the signing path.
 */

import type { Plan } from "@/db/schema";

export interface PlanSpec {
  id: Plan;
  name: string;
  priceMonthly: number;
  /** Annual = 2 months free (README). */
  priceAnnual: number;
  waiversPerMonth: number;
  locations: number;
  kiosk: boolean;
  checkinBoard: boolean;
  expiryRules: boolean;
  incidents: boolean;
  csvExport: boolean;
  webhookOut: boolean;
  brandedEmails: boolean;
  /** Can the "Waivers by WaiverWing" poster footer be switched off? */
  removablePosterFooter: boolean;
}

export const PLANS: Record<Plan, PlanSpec> = {
  counter: {
    id: "counter",
    name: "Counter",
    priceMonthly: 29,
    priceAnnual: 290,
    waiversPerMonth: 200,
    locations: 1,
    kiosk: false,
    checkinBoard: false,
    expiryRules: false,
    incidents: false,
    csvExport: false,
    webhookOut: false,
    brandedEmails: false,
    removablePosterFooter: false,
  },
  front_desk: {
    id: "front_desk",
    name: "Front Desk",
    priceMonthly: 59,
    priceAnnual: 590,
    waiversPerMonth: 1000,
    locations: 1,
    kiosk: true,
    checkinBoard: true,
    expiryRules: true,
    incidents: true,
    csvExport: true,
    webhookOut: false,
    brandedEmails: false,
    removablePosterFooter: false,
  },
  operator: {
    id: "operator",
    name: "Operator",
    priceMonthly: 99,
    priceAnnual: 990,
    waiversPerMonth: 5000,
    locations: 3,
    kiosk: true,
    checkinBoard: true,
    expiryRules: true,
    incidents: true,
    csvExport: true,
    webhookOut: true,
    brandedEmails: true,
    removablePosterFooter: true,
  },
};

export const PLAN_ORDER: Plan[] = ["counter", "front_desk", "operator"];

export function plan(id: Plan | string | null | undefined): PlanSpec {
  return PLANS[(id ?? "counter") as Plan] ?? PLANS.counter;
}

export function nextPlanUp(id: Plan): Plan | null {
  const i = PLAN_ORDER.indexOf(id);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

/* ------------------------------------------------------------- soft caps */

export type SoftCapState = "ok" | "warn" | "over";

/** 80% of the cap is where the upgrade prompt starts; 100% is "over". */
export function softCapState(planId: Plan, monthlyVolume: number): SoftCapState {
  const cap = plan(planId).waiversPerMonth;
  if (monthlyVolume > cap) return "over";
  if (monthlyVolume >= Math.floor(cap * 0.8)) return "warn";
  return "ok";
}

export function softCapMessage(planId: Plan, monthlyVolume: number): string | null {
  const spec = plan(planId);
  const state = softCapState(planId, monthlyVolume);
  const up = nextPlanUp(planId);
  if (state === "ok") return null;
  if (state === "warn") {
    return `${monthlyVolume} of ${spec.waiversPerMonth} waivers used this month.${
      up ? ` ${plan(up).name} raises it to ${plan(up).waiversPerMonth}.` : ""
    }`;
  }
  return `${monthlyVolume} waivers this month — ${monthlyVolume - spec.waiversPerMonth} over the ${
    spec.name
  } cap. Signing keeps working; nothing is blocked.${
    up ? ` ${plan(up).name} covers ${plan(up).waiversPerMonth}/mo.` : ""
  }`;
}

/* --------------------------------------------------------- trials & gates */

export interface TrialLike {
  plan: Plan;
  trialEndsAt: Date | null;
}

export function trialActive(account: TrialLike, now: Date = new Date()): boolean {
  return Boolean(account.trialEndsAt && account.trialEndsAt.getTime() > now.getTime());
}

/**
 * The plan whose *features* apply. The 14-day trial is full-featured (README),
 * so during it the account gets Operator capabilities while its billing plan
 * and its volume cap stay whatever it signed up on.
 */
export function featurePlan(account: TrialLike, now: Date = new Date()): Plan {
  return trialActive(account, now) ? "operator" : account.plan;
}

export type Feature =
  | "kiosk"
  | "checkinBoard"
  | "expiryRules"
  | "incidents"
  | "csvExport"
  | "webhookOut"
  | "brandedEmails"
  | "removablePosterFooter";

export function featureAllowed(account: TrialLike, feature: Feature, now?: Date): boolean {
  return plan(featurePlan(account, now))[feature];
}

/** Locations allowed, honouring the trial's full-feature promise. */
export function locationsAllowed(account: TrialLike, now?: Date): number {
  return plan(featurePlan(account, now)).locations;
}

/** Resolve which plan a Stripe price ID corresponds to. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: Record<Plan, string>,
): Plan | null {
  if (!priceId) return null;
  for (const id of PLAN_ORDER) {
    if (prices[id] && prices[id] === priceId) return id;
  }
  return null;
}
