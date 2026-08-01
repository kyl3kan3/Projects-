/**
 * Plan catalog — the single source of truth for tiers, limits, and gates.
 * Mirrors the pricing table in README.md exactly. Prices here are display-only;
 * billable Stripe price IDs live in env.
 *
 * Two columns of that table are deliberately declared but not metered at MVP:
 * SMS requests and video reviews are not in the MVP feature list, so the ladder
 * can be shown honestly without pretending the features exist. `featureAllowed`
 * is the only gate, and the UI never offers what it returns false for.
 */

import type { Tier, WidgetType } from "@/db/schema";

export type Feature =
  | "emailRequests"
  | "photoReviews"
  | "incentives"
  | "smsRequests"
  | "imports"
  | "videoReviews"
  | "abTesting"
  | "apiAccess";

/** How the "Powered by TrustBadge" link behaves on this tier. */
export type Branding = "required" | "optional" | "removed";

export interface Plan {
  id: Tier;
  name: string;
  priceMonthly: number;
  /** Orders per month. `null` = no hard limit (see `softCapOrders`). */
  ordersPerMonth: number | null;
  /** Fair-use ceiling on the unlimited tier — we talk, we never ambush. */
  softCapOrders: number | null;
  widgetTypes: readonly WidgetType[];
  features: readonly Feature[];
  branding: Branding;
  blurb: string;
}

export const PLANS: Record<Tier, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    ordersPerMonth: 50,
    softCapOrders: null,
    widgetTypes: ["badge"],
    features: [],
    branding: "required",
    blurb: "The badge, on your storefront, forever.",
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 19,
    ordersPerMonth: 300,
    softCapOrders: null,
    widgetTypes: ["wall", "carousel", "badge", "stars"],
    features: ["emailRequests"],
    branding: "required",
    blurb: "Every widget, and email review requests that actually arrive.",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 39,
    ordersPerMonth: 1_500,
    softCapOrders: null,
    widgetTypes: ["wall", "carousel", "badge", "stars"],
    features: ["emailRequests", "photoReviews", "incentives", "smsRequests", "imports"],
    branding: "optional",
    blurb: "Photo reviews, incentives, and one-click migration off Judge.me or Loox.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 79,
    ordersPerMonth: null,
    softCapOrders: 10_000,
    widgetTypes: ["wall", "carousel", "badge", "stars"],
    features: [
      "emailRequests",
      "photoReviews",
      "incentives",
      "smsRequests",
      "imports",
      "videoReviews",
      "abTesting",
      "apiAccess",
    ],
    branding: "removed",
    blurb: "Unlimited orders, video reviews, A/B testing, API.",
  },
};

export const TIER_ORDER: Tier[] = ["free", "starter", "growth", "pro"];
export const PAID_TIERS: Exclude<Tier, "free">[] = ["starter", "growth", "pro"];

export function plan(tier: Tier): Plan {
  return PLANS[tier] ?? PLANS.free;
}

export function featureAllowed(tier: Tier, feature: Feature): boolean {
  return plan(tier).features.includes(feature);
}

export function widgetTypeAllowed(tier: Tier, type: WidgetType): boolean {
  return plan(tier).widgetTypes.includes(type);
}

/**
 * Whether the "Powered by TrustBadge" link renders. On `required` tiers the
 * merchant's preference is ignored (the free tier *is* the distribution
 * channel); on `removed` it never renders even if the stored setting says true.
 */
export function resolveBranding(tier: Tier, merchantWantsBranding: boolean): boolean {
  switch (plan(tier).branding) {
    case "required":
      return true;
    case "removed":
      return false;
    default:
      return merchantWantsBranding;
  }
}

export interface Metering {
  tier: Tier;
  used: number;
  /** null when the tier has no hard limit. */
  limit: number | null;
  /** Requests stop being scheduled at this point. */
  overLimit: boolean;
  /** Past the fair-use ceiling on an unlimited tier: we contact them, nothing stops. */
  overSoftCap: boolean;
  /** 0–1, clamped. `null` on an unlimited tier. */
  fraction: number | null;
  remaining: number | null;
}

/**
 * The order-count meter. Called on ingest (to decide whether to schedule a
 * request) and on the dashboard (to show the merchant where they stand).
 *
 * Going over the limit never rejects the order — the order is data, and dropping
 * it would corrupt the merchant's own history. It only stops new outreach.
 */
export function meter(tier: Tier, ordersThisPeriod: number): Metering {
  const p = plan(tier);
  const used = Math.max(0, Math.floor(ordersThisPeriod));
  const limit = p.ordersPerMonth;
  return {
    tier,
    used,
    limit,
    overLimit: limit !== null && used >= limit,
    overSoftCap: p.softCapOrders !== null && used >= p.softCapOrders,
    fraction: limit === null ? null : Math.min(1, used / limit),
    remaining: limit === null ? null : Math.max(0, limit - used),
  };
}

/** Resolve which tier a Stripe price ID corresponds to. */
export function tierForPrice(
  priceId: string | null | undefined,
  prices: { starter: string; growth: string; pro: string },
): Tier {
  if (!priceId) return "free";
  if (prices.pro && priceId === prices.pro) return "pro";
  if (prices.growth && priceId === prices.growth) return "growth";
  if (prices.starter && priceId === prices.starter) return "starter";
  return "free";
}

/** The cheapest tier that unlocks a feature — what an upgrade prompt names. */
export function tierUnlocking(feature: Feature): Tier | null {
  return TIER_ORDER.find((t) => featureAllowed(t, feature)) ?? null;
}

/** The cheapest tier that offers a widget type. */
export function tierUnlockingWidget(type: WidgetType): Tier | null {
  return TIER_ORDER.find((t) => widgetTypeAllowed(t, type)) ?? null;
}
