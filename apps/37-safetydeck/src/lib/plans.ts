/**
 * Plans. Priced by field headcount — the axis that tracks both value and OSHA
 * exposure — and every plan includes every compliance feature. Holding the 300A
 * behind a paywall would be product malpractice, so nothing here gates a form,
 * an export, or a signature.
 *
 * Money is integer cents. Pure module: no db, no env, safe on the client.
 */

export type PlanId = "crew" | "company" | "fleet";

export interface PlanSpec {
  id: PlanId;
  name: string;
  /** Monthly price in cents. */
  priceCents: number;
  /** Annual price in cents — two months free, per README. */
  annualCents: number;
  /** Maximum active field employees on the roster. */
  headcount: number;
  tagline: string;
  includes: string[];
}

export const PLANS: Record<PlanId, PlanSpec> = {
  crew: {
    id: "crew",
    name: "Crew",
    priceCents: 5_900,
    annualCents: 59_000,
    headcount: 15,
    tagline: "One crew, one foreman, the whole compliance kit.",
    includes: [
      "Toolbox-talk library + weekly scheduling",
      "Phone sign-off: signature, huddle photo, GPS and time stamp",
      "Incident log with OSHA 300 / 301 / 300A output",
      "Cert tracker with the 60/30/7-day ladder",
      "Inspection binder export",
    ],
  },
  company: {
    id: "company",
    name: "Company",
    priceCents: 9_900,
    annualCents: 99_000,
    headcount: 40,
    tagline: "Several crews, several sites, one record.",
    includes: [
      "Everything in Crew",
      "Multiple crews and sites",
      "Custom talk upload",
      "Reminder escalations to ops",
    ],
  },
  fleet: {
    id: "fleet",
    name: "Fleet",
    priceCents: 14_900,
    annualCents: 149_000,
    headcount: 100,
    tagline: "Up to 100 field employees, priority support.",
    includes: [
      "Everything in Company",
      "Up to 100 field employees",
      "Attendance and roster CSV export",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["crew", "company", "fleet"];

export const PLAN_HEADCOUNT_LIMITS: Record<PlanId, number> = {
  crew: PLANS.crew.headcount,
  company: PLANS.company.headcount,
  fleet: PLANS.fleet.headcount,
};

/** 2025 federal maximum for a single serious violation, in cents. */
export const SERIOUS_PENALTY_CENTS = 1_655_000;
/** 2025 federal maximum for a willful or repeated violation, in cents. */
export const WILLFUL_PENALTY_CENTS = 16_551_400;

export function formatUsd(cents: number): string {
  const dollars = Math.round(cents) / 100;
  return dollars % 1 === 0
    ? `$${dollars.toLocaleString("en-US")}`
    : `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** How many months of a plan one avoided serious citation pays for. */
export function monthsCoveredByOneCitation(plan: PlanId): number {
  return Math.floor(SERIOUS_PENALTY_CENTS / PLANS[plan].priceCents);
}

export interface HeadcountCheck {
  limit: number;
  active: number;
  /** Whether one more active field employee fits on this plan. */
  allowed: boolean;
  /** The cheapest plan that would fit `active + 1`, or null if none does. */
  suggestion: PlanId | null;
  message: string | null;
}

/**
 * Adding employee N+1 past the limit prompts an upgrade. It never silently
 * fails, and it never disables the records already captured — the roster is the
 * denominator of a legal document.
 */
export function checkHeadcount(plan: PlanId, activeEmployees: number): HeadcountCheck {
  const limit = PLAN_HEADCOUNT_LIMITS[plan];
  const wanted = activeEmployees + 1;
  if (wanted <= limit) {
    return { limit, active: activeEmployees, allowed: true, suggestion: null, message: null };
  }
  const suggestion = PLAN_ORDER.find((p) => PLAN_HEADCOUNT_LIMITS[p] >= wanted) ?? null;
  const message = suggestion
    ? `${PLANS[plan].name} covers ${limit} field employees and you have ${activeEmployees}. ${PLANS[suggestion].name} covers ${PLAN_HEADCOUNT_LIMITS[suggestion]} for ${formatUsd(PLANS[suggestion].priceCents)}/mo.`
    : `Fleet covers ${PLAN_HEADCOUNT_LIMITS.fleet} field employees and you have ${activeEmployees}. Talk to us about multi-entity — that is past the self-serve tiers.`;
  return { limit, active: activeEmployees, allowed: false, suggestion, message };
}

export function planFromPriceId(
  priceId: string,
  prices: Record<PlanId, string>,
): PlanId | null {
  for (const id of PLAN_ORDER) if (prices[id] && prices[id] === priceId) return id;
  return null;
}
