/**
 * src/lib/plans.ts
 *
 * The plan catalog — one source of truth for tiers, seat limits, and feature
 * gates. Mirrors README.md's pricing table exactly. Display prices live here;
 * billable Stripe price IDs live in env.
 *
 * Every tier includes every discovery feed: nobody pays extra to see a tender
 * (README, "Monetization & Pricing"). What the tiers buy is seats, the
 * response workspace, and portfolios/reporting.
 */

export type PlanId = "trial" | "scout" | "pursuit" | "capture";

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in integer cents. Money is never a float here. */
  priceCents: number;
  seats: number;
  /** Keyword profiles allowed. Capture buys the portfolio. */
  profiles: number;
  /** Pursuits, scorecards, requirement checklists, answer library. */
  responseWorkspace: boolean;
  /** Win/loss reporting + CSV export. */
  reporting: boolean;
  blurb: string;
  includes: readonly string[];
}

export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    name: "Trial",
    priceCents: 0,
    seats: 5,
    profiles: 3,
    responseWorkspace: true,
    reporting: true,
    blurb: `Full access for ${TRIAL_DAYS} days. No card.`,
    includes: [
      "Every discovery feed",
      "Response workspace and answer library",
      "Win/loss reporting",
    ],
  },
  scout: {
    id: "scout",
    name: "Scout",
    priceCents: 9_900,
    seats: 2,
    profiles: 1,
    responseWorkspace: false,
    reporting: false,
    blurb: "Discovery: find every tender worth reading.",
    includes: [
      "Keyword profiles",
      "Federal (SAM.gov) + state portal feeds",
      "Scored matches with reasons",
      "Deadline calendar + ICS feed",
      "Email/Slack morning scan",
    ],
  },
  pursuit: {
    id: "pursuit",
    name: "Pursuit",
    priceCents: 19_900,
    seats: 5,
    profiles: 1,
    responseWorkspace: true,
    reporting: false,
    blurb: "Discovery plus the response desk.",
    includes: [
      "Everything in Scout",
      "Response workspace",
      "Answer library with staleness flags",
      "Go/no-go scorecards",
      "Pursuit stages + owner assignments",
    ],
  },
  capture: {
    id: "capture",
    name: "Capture",
    priceCents: 29_900,
    seats: 10,
    profiles: 8,
    responseWorkspace: true,
    reporting: true,
    blurb: "Multiple portfolios and the honest denominator.",
    includes: [
      "Everything in Pursuit",
      "Multi-profile portfolios",
      "Win/loss records + reporting",
      "API/CSV export",
      "Priority support",
    ],
  },
};

/** The three purchasable tiers, in ladder order. */
export const PAID_PLANS: readonly PlanId[] = ["scout", "pursuit", "capture"] as const;

export function plan(id: PlanId | string | null | undefined): Plan {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return PLANS.trial;
}

/** Cents -> "$99" / "$99.50". Rounds once, at the edge. */
export function formatPriceCents(cents: number): string {
  const whole = Math.round(cents) / 100;
  return whole % 1 === 0 ? `$${whole.toFixed(0)}` : `$${whole.toFixed(2)}`;
}

/** The next tier up the ladder, or null at the top. */
export function nextPlanUp(id: PlanId): PlanId | null {
  if (id === "trial") return "pursuit";
  const index = PAID_PLANS.indexOf(id);
  if (index < 0 || index === PAID_PLANS.length - 1) return null;
  return PAID_PLANS[index + 1];
}

export interface SeatCheck {
  allowed: boolean;
  seats: number;
  limit: number;
  /** Set when the invite is blocked; the UI turns this into an upgrade prompt. */
  upgradeTo: PlanId | null;
  message: string;
}

/**
 * Seat-limit enforcement. Inviting seat N+1 never fails silently: it returns
 * the reason and the tier that would fit (README: "prompts upgrade -- never
 * blocks silently").
 */
export function checkSeat(planId: PlanId, currentSeats: number): SeatCheck {
  const p = plan(planId);
  if (currentSeats < p.seats) {
    return {
      allowed: true,
      seats: currentSeats,
      limit: p.seats,
      upgradeTo: null,
      message: `${currentSeats + 1} of ${p.seats} seats used on ${p.name}.`,
    };
  }
  const fits = PAID_PLANS.find((id) => PLANS[id].seats > currentSeats) ?? null;
  return {
    allowed: false,
    seats: currentSeats,
    limit: p.seats,
    upgradeTo: fits,
    message: fits
      ? `${p.name} includes ${p.seats} seats and all ${p.seats} are used. ${PLANS[fits].name} includes ${PLANS[fits].seats} — upgrade to add this seat.`
      : `${p.name} includes ${p.seats} seats and all ${p.seats} are used. Contact us to add more.`,
  };
}

/** Profile-count gate. Multi-profile portfolios are a Capture feature. */
export function checkProfile(planId: PlanId, currentProfiles: number): SeatCheck {
  const p = plan(planId);
  if (currentProfiles < p.profiles) {
    return {
      allowed: true,
      seats: currentProfiles,
      limit: p.profiles,
      upgradeTo: null,
      message: `${currentProfiles + 1} of ${p.profiles} profiles used on ${p.name}.`,
    };
  }
  const fits = PAID_PLANS.find((id) => PLANS[id].profiles > currentProfiles) ?? null;
  return {
    allowed: false,
    seats: currentProfiles,
    limit: p.profiles,
    upgradeTo: fits,
    message: fits
      ? `${p.name} includes ${p.profiles} keyword profile${p.profiles === 1 ? "" : "s"}. ${PLANS[fits].name} includes ${PLANS[fits].profiles} — upgrade for a portfolio.`
      : `${p.name} includes ${p.profiles} keyword profiles.`,
  };
}

export function hasResponseWorkspace(planId: PlanId): boolean {
  return plan(planId).responseWorkspace;
}

export function hasReporting(planId: PlanId): boolean {
  return plan(planId).reporting;
}

/** Which plan a Stripe price ID maps to; unknown prices never grant access. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { scout: string; pursuit: string; capture: string },
): PlanId | null {
  if (!priceId) return null;
  if (prices.capture && priceId === prices.capture) return "capture";
  if (prices.pursuit && priceId === prices.pursuit) return "pursuit";
  if (prices.scout && priceId === prices.scout) return "scout";
  return null;
}

/**
 * Trial / dunning state, derived as-of-now rather than read from a stored
 * status column (a stored one shows "Trial" three weeks after it lapsed).
 */
export interface AccessState {
  planId: PlanId;
  /** False once a trial has lapsed with no subscription, or dunning ran out. */
  active: boolean;
  /** Writes blocked, reads and exports still allowed. */
  readOnly: boolean;
  trialDaysLeft: number | null;
  reason: string | null;
}

export function accessState(
  firm: {
    plan: string;
    trialEndsAt: Date | null;
    stripeSubscriptionId: string | null;
    settings: unknown;
  },
  now: Date = new Date(),
): AccessState {
  const planId = (firm.plan in PLANS ? firm.plan : "trial") as PlanId;
  const settings = (firm.settings ?? {}) as { pastDueSince?: string };

  if (planId === "trial") {
    const endsAt = firm.trialEndsAt;
    if (!endsAt) {
      return { planId, active: true, readOnly: false, trialDaysLeft: null, reason: null };
    }
    const msLeft = endsAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / 86_400_000);
    if (msLeft <= 0) {
      return {
        planId,
        active: false,
        readOnly: true,
        trialDaysLeft: 0,
        reason: "Your 14-day trial has ended. Pick a plan to keep the morning scan running.",
      };
    }
    return { planId, active: true, readOnly: false, trialDaysLeft: daysLeft, reason: null };
  }

  // Paid plan in dunning: 7 days of grace, then read-only. The library stays
  // exportable either way — the anti-lock-in promise holds even in dunning.
  if (settings.pastDueSince) {
    const since = new Date(settings.pastDueSince);
    const graceEnds = new Date(since.getTime() + 7 * 86_400_000);
    if (now >= graceEnds) {
      return {
        planId,
        active: false,
        readOnly: true,
        trialDaysLeft: null,
        reason:
          "The last payment failed and the grace period is over. The account is read-only; your library is still exportable.",
      };
    }
    return {
      planId,
      active: true,
      readOnly: false,
      trialDaysLeft: null,
      reason: `A payment failed. Update your card by ${graceEnds.toISOString().slice(0, 10)} to avoid read-only mode.`,
    };
  }

  return { planId, active: true, readOnly: false, trialDaysLeft: null, reason: null };
}
