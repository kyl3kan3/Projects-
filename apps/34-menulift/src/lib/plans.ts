/**
 * Plans and entitlements (README "Monetization & Pricing").
 *
 * Per location, per month. Three tiers, 14-day trial on all of them, no free
 * tier. Multi-location: 20% off every location past the first — computed here
 * in integer cents so the number the owner sees and the number Stripe charges
 * come from one function.
 *
 * Pure module: no database, no Stripe. Client components import it freely.
 */

export const PLAN_IDS = ["menu", "kitchen", "margin"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Feature =
  | "menuBuilder"
  | "publicMenu"
  | "qrPrintables"
  | "eightySix"
  | "changeHistory"
  | "photoEnhancement"
  | "itemScheduling"
  | "multipleMenus"
  | "posImport"
  | "matrix";

export interface Plan {
  id: PlanId;
  name: string;
  /** Per location, per month, in cents. */
  priceCents: number;
  tagline: string;
  features: Feature[];
  /** What the tier adds over the one below, for the pricing table. */
  adds: string[];
}

const MENU_FEATURES: Feature[] = [
  "menuBuilder",
  "publicMenu",
  "qrPrintables",
  "eightySix",
  "changeHistory",
];
const KITCHEN_FEATURES: Feature[] = [
  ...MENU_FEATURES,
  "photoEnhancement",
  "itemScheduling",
  "multipleMenus",
];
const MARGIN_FEATURES: Feature[] = [...KITCHEN_FEATURES, "posImport", "matrix"];

export const PLANS: Record<PlanId, Plan> = {
  menu: {
    id: "menu",
    name: "Menu",
    priceCents: 2900,
    tagline: "The menu, live and honest.",
    features: MENU_FEATURES,
    adds: [
      "Menu builder — sections, prices, dietary tags",
      "Hosted QR menu page",
      "QR codes, table tents and window cards",
      "One-tap 86ing with instant propagation",
      "Full change history",
    ],
  },
  kitchen: {
    id: "kitchen",
    name: "Kitchen",
    priceCents: 4900,
    tagline: "Everything in Menu, plus the camera roll.",
    features: KITCHEN_FEATURES,
    adds: [
      "Dish-photo enhancement with approval workflow",
      "Item scheduling and nightly auto-restore",
      "Multiple menus and dayparts",
    ],
  },
  margin: {
    id: "margin",
    name: "Margin",
    priceCents: 7900,
    tagline: "Everything in Kitchen, plus which dishes pay the rent.",
    features: MARGIN_FEATURES,
    adds: [
      "POS CSV import (Toast and Square)",
      "Stars / plowhorses / puzzles / dogs matrix",
      "Per-item recommendations",
    ],
  },
};

export const TRIAL_DAYS = 14;

/** 20% off every location past the first. */
export const MULTI_LOCATION_DISCOUNT_BP = 2000;

export function isPlanId(value: string | null | undefined): value is PlanId {
  return !!value && (PLAN_IDS as readonly string[]).includes(value);
}

export function planFor(value: string | null | undefined): Plan {
  return isPlanId(value) ? PLANS[value] : PLANS.menu;
}

export function featureAllowed(plan: string | null | undefined, feature: Feature): boolean {
  return planFor(plan).features.includes(feature);
}

/** The plan a feature first appears on — used by upgrade prompts. */
export function planRequiredFor(feature: Feature): Plan {
  for (const id of PLAN_IDS) {
    if (PLANS[id].features.includes(feature)) return PLANS[id];
  }
  return PLANS.margin;
}

/**
 * Monthly total in cents for `locations` sites on `plan`.
 *
 * First location full price; each additional one 20% off. Rounding happens once
 * per line, half-up, before the sum — the same order Stripe's tiered price
 * applies it, so the invoice and the pricing page agree to the cent.
 */
export function monthlyTotalCents(plan: PlanId, locations: number): number {
  const count = Math.max(1, Math.trunc(locations));
  const base = PLANS[plan].priceCents;
  const discounted = Math.round((base * (10000 - MULTI_LOCATION_DISCOUNT_BP)) / 10000);
  return base + discounted * (count - 1);
}

/** Effective per-location price, for "…works out to $X per location". */
export function blendedPerLocationCents(plan: PlanId, locations: number): number {
  const count = Math.max(1, Math.trunc(locations));
  return Math.round(monthlyTotalCents(plan, count) / count);
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "none";

/**
 * Does this organisation get to use the product right now?
 *
 * `past_due` deliberately stays entitled: a failed card must never take a
 * restaurant's menu off the wall mid-service. The dashboard nags; the guest
 * page keeps serving.
 */
export function isEntitled(status: string, trialEndsAt: Date | null, now: Date): boolean {
  if (status === "active" || status === "past_due") return true;
  if (status === "trialing") return !!trialEndsAt && trialEndsAt.getTime() > now.getTime();
  return false;
}

/** Whole days left in a trial, floored at 0. */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date): number {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
