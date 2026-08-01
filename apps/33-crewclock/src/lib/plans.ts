/**
 * The plan catalogue and the seat maths — the single source of truth for
 * pricing, the $49 floor, and which features each plan gates.
 *
 * Mirrors the pricing table in README.md. Display prices live here; the
 * billable Stripe price IDs live in env.
 *
 * ## The floor
 *
 * Stripe bills `unit price x quantity`. A 4-seat Crew org is $32, which is
 * below the $49 monthly minimum the README commits to. Rather than fake the
 * quantity (which would lie to the customer on their invoice), the subscription
 * carries the true seat count and the floor is applied as a separate invoice
 * item at `invoice.created` time: `max(0, 4900 - seats x unit)`. The invoice
 * then reads "10 x Crew @ $8.00" plus, when it applies, "Monthly minimum
 * adjustment" — which is exactly what it is.
 */

import type { Plan } from "@/db/schema";

/** The monthly minimum invoice, in cents. */
export const MONTHLY_FLOOR_CENTS = 4900;
/** Thirty days spans a full payroll cycle — the trial ends after the habit. */
export const TRIAL_DAYS = 30;

export interface PlanSpec {
  id: Plan;
  name: string;
  /** Per active user, per month, in cents. */
  seatPriceCents: number;
  /** Feature gates. Anything false is a Company-plan upsell moment. */
  features: {
    geofencedPunches: true;
    offlineCapture: true;
    bilingualCrewUi: true;
    timesheetReview: true;
    overtimeAlerts: true;
    payrollExport: true;
    /** Entering a labour budget on a job. */
    bids: boolean;
    /** The cost bar, job detail cost figures, and the projection line. */
    jobCosting: boolean;
    budgetAlerts: boolean;
    multiCrewReporting: boolean;
  };
}

export const PLANS: Record<Plan, PlanSpec> = {
  crew: {
    id: "crew",
    name: "Crew",
    seatPriceCents: 800,
    features: {
      geofencedPunches: true,
      offlineCapture: true,
      bilingualCrewUi: true,
      timesheetReview: true,
      overtimeAlerts: true,
      payrollExport: true,
      bids: false,
      jobCosting: false,
      budgetAlerts: false,
      multiCrewReporting: false,
    },
  },
  company: {
    id: "company",
    name: "Company",
    seatPriceCents: 1200,
    features: {
      geofencedPunches: true,
      offlineCapture: true,
      bilingualCrewUi: true,
      timesheetReview: true,
      overtimeAlerts: true,
      payrollExport: true,
      bids: true,
      jobCosting: true,
      budgetAlerts: true,
      multiCrewReporting: true,
    },
  },
};

export function planSpec(id: Plan | string | null | undefined): PlanSpec {
  return PLANS[(id ?? "crew") as Plan] ?? PLANS.crew;
}

export function planAllows(id: Plan, feature: keyof PlanSpec["features"]): boolean {
  return planSpec(id).features[feature] === true;
}

/** Seats x unit price, before the floor. */
export function seatSubtotalCents(id: Plan, seats: number): number {
  return Math.max(0, Math.floor(seats)) * planSpec(id).seatPriceCents;
}

/** What the customer is actually invoiced this month. */
export function monthlyInvoiceCents(id: Plan, seats: number): number {
  return Math.max(MONTHLY_FLOOR_CENTS, seatSubtotalCents(id, seats));
}

/** The floor adjustment line item, or 0 when seats already clear the minimum. */
export function floorAdjustmentCents(id: Plan, seats: number): number {
  return Math.max(0, MONTHLY_FLOOR_CENTS - seatSubtotalCents(id, seats));
}

/** The seat count at which the floor stops applying. Crew: 7. Company: 5. */
export function seatsToClearFloor(id: Plan): number {
  return Math.ceil(MONTHLY_FLOOR_CENTS / planSpec(id).seatPriceCents);
}

/** Which plan a Stripe price ID belongs to; unknown prices mean no upgrade. */
export function planForPrice(
  priceId: string | null | undefined,
  prices: { crew: string; company: string },
): Plan | null {
  if (priceId && prices.company && priceId === prices.company) return "company";
  if (priceId && prices.crew && priceId === prices.crew) return "crew";
  return null;
}

/** Trial state, computed rather than stored, so a clock change cannot grant time. */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
