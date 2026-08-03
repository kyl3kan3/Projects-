/**
 * MatPass's own three tiers, and the soft student limit.
 *
 * "Soft" is the whole point: student 101 on the Dojo plan prompts an upgrade and
 * is still added, and check-in never consults any of this. Holding a school's
 * attendance hostage over a plan boundary would break the one promise the product
 * makes — every stripe earned, on the record — for the sake of $40/month.
 *
 * Money is integer cents throughout. There is no float anywhere in this file.
 */

import type { PlanTier } from "@/db/schema";

/**
 * Re-exported so client components can type a tier without importing the schema
 * module — even as a type-only import, a client file naming `@/db/schema` is a
 * step away from naming `@/db`.
 */
export type { PlanTier };

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceCents: number;
  studentLimit: number;
  blurb: string;
  includes: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  dojo: {
    tier: "dojo",
    name: "Dojo",
    priceCents: 5900,
    studentLimit: 100,
    blurb: "One program or four, one location, everything that matters.",
    includes: [
      "Curricula with belt and stripe tracking",
      "Kiosk check-in on any tablet",
      "Grading events with eligibility",
      "Family memberships + Stripe billing",
      "Retention flags",
      "Email announcements",
    ],
  },
  academy: {
    tier: "academy",
    name: "Academy",
    priceCents: 9900,
    studentLimit: 250,
    blurb: "The growing school: separate curricula per program, staff accounts.",
    includes: [
      "Everything in Dojo",
      "Multiple programs with separate curricula",
      "Instructor and front-desk accounts",
      "Attendance analytics",
      "Waiver document uploads",
      "CSV export",
    ],
  },
  federation: {
    tier: "federation",
    name: "Federation",
    priceCents: 14900,
    studentLimit: 500,
    blurb: "Up to three locations with one progression ledger across them.",
    includes: [
      "Everything in Academy",
      "Multi-location (up to 3)",
      "Cross-location reporting",
      "API export",
      "Priority support",
    ],
  },
};

export const PLAN_ORDER: PlanTier[] = ["dojo", "academy", "federation"];

export const TRIAL_DAYS = 14;

/** Annual is two months free — 10x the monthly price. */
export function annualCents(tier: PlanTier): number {
  return PLANS[tier].priceCents * 10;
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}$${dollars.toLocaleString("en-US")}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

export interface LimitVerdict {
  overLimit: boolean;
  activeStudents: number;
  limit: number;
  /** The tier that would hold this roster, or null when nothing does. */
  suggested: PlanTier | null;
  message: string | null;
}

/**
 * Soft limit check. Never returns "blocked" — the strongest thing it can say is
 * "you are over, here is the plan that fits".
 */
export function checkStudentLimit(tier: PlanTier, activeStudents: number): LimitVerdict {
  const limit = PLANS[tier].studentLimit;
  if (activeStudents <= limit) {
    return { overLimit: false, activeStudents, limit, suggested: null, message: null };
  }
  const suggested = PLAN_ORDER.find((t) => PLANS[t].studentLimit >= activeStudents) ?? null;
  const message = suggested
    ? `${activeStudents} active students is past the ${PLANS[tier].name} plan's ${limit}. ${PLANS[suggested].name} covers up to ${PLANS[suggested].studentLimit} for ${formatMoney(PLANS[suggested].priceCents)}/mo.`
    : `${activeStudents} active students is past every self-serve plan. Talk to us about multi-location pricing.`;
  return { overLimit: true, activeStudents, limit, suggested, message };
}

export interface TrialState {
  trialing: boolean;
  daysLeft: number;
  expired: boolean;
}

export function trialState(trialEndsAt: Date | null, now = new Date()): TrialState {
  if (!trialEndsAt) return { trialing: false, daysLeft: 0, expired: false };
  const ms = trialEndsAt.getTime() - now.getTime();
  const daysLeft = Math.max(0, Math.ceil(ms / 86_400_000));
  return { trialing: ms > 0, daysLeft, expired: ms <= 0 };
}

/**
 * Per-family tuition arithmetic. A family plan is one charge for the household; a
 * per-student plan multiplies by covered students. Rounded once, at the edge —
 * there is no intermediate rounding to accumulate error.
 */
export function tuitionCents(
  plan: { amountCents: number; kind: "per_student" | "family_flat" },
  coveredStudents: number,
): number {
  if (plan.kind === "family_flat") return plan.amountCents;
  return plan.amountCents * Math.max(0, coveredStudents);
}
