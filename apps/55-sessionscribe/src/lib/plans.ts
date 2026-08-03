/**
 * src/lib/plans.ts
 *
 * Plans, the note meter, and the read-only rule — as pure functions of a
 * practice's billing facts plus the current time. Nothing here reads the
 * database or Stripe, which is what makes the awkward cases testable: the last
 * day of a trial, the 41st note on Solo, a failed payment inside its grace
 * window, a cancelled subscription with signed notes that must stay exportable
 * forever.
 *
 * Two decisions worth stating because they are easy to get wrong:
 *
 *  - **Nothing that would trap a clinician's records is ever gated.** Reviewing,
 *    signing, amending and exporting an existing note work on every plan, in
 *    read-only mode, after cancellation. Only *new capture* is metered. A
 *    documentation product that held finished notes hostage would be indefensible.
 *  - **Grace is a fixed date, not a live condition.** A failed payment stamps
 *    `graceEndsAt` once; read-only follows from that stamp. Recomputing "is
 *    past due" on every render is how a product either nags forever or forgets.
 */

import type { Plan } from "@/db/schema";

export interface PlanDef {
  id: Plan;
  name: string;
  priceCents: number;
  /** null = unlimited notes per month. */
  noteLimit: number | null;
  /** Modality templates beyond general SOAP/DAP. */
  modalityTemplates: boolean;
  amendments: boolean;
  minSeats: number;
  blurb: string;
  includes: string[];
}

export const PLANS: Record<Plan, PlanDef> = {
  solo: {
    id: "solo",
    name: "Solo",
    priceCents: 3900,
    noteLimit: 40,
    modalityTemplates: false,
    amendments: false,
    minSeats: 1,
    blurb: "up to 40 notes/mo",
    includes: [
      "Record, upload, or type shorthand",
      "SOAP and DAP formats",
      "Review · edit · sign flow",
      "Signed-note PDF export",
      "Audit log",
    ],
  },
  caseload: {
    id: "caseload",
    name: "Caseload",
    priceCents: 6900,
    noteLimit: null,
    modalityTemplates: true,
    amendments: true,
    minSeats: 1,
    blurb: "unlimited notes",
    includes: [
      "Everything in Solo",
      "CBT, EMDR and couples templates",
      "Amendments as new signed versions",
      "Unlimited notes",
    ],
  },
  group: {
    id: "group",
    name: "Group",
    priceCents: 9900,
    noteLimit: null,
    modalityTemplates: true,
    amendments: true,
    minSeats: 2,
    blurb: "per clinician, min 2",
    includes: [
      "Everything in Caseload",
      "Practice-wide template standards",
      "Roster admin",
      "Org audit exports",
    ],
  },
};

export const TRIAL_DAYS = 14;
/** Days after a failed payment before the practice goes read-only. */
export const GRACE_DAYS = 7;

export type BillingState = "trialing" | "active" | "past_due" | "canceled";

/** The billing-relevant slice of a practice row, so tests need no database. */
export interface BillingFacts {
  plan: Plan;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  /** Set by the Stripe webhook worker; see lib/billing.ts. */
  billingState?: BillingState | null;
  graceEndsAt?: Date | null;
}

export interface Entitlement {
  plan: PlanDef;
  state: BillingState;
  trialing: boolean;
  /** Whole days left in the trial; 0 once it has ended. */
  trialDaysLeft: number;
  /** null = unlimited. */
  noteLimit: number | null;
  modalityTemplates: boolean;
  amendments: boolean;
  /** No new captures: review, signing and export still work. */
  readOnly: boolean;
  /** Plain sentence for the billing banner; null when nothing is wrong. */
  notice: string | null;
}

/**
 * What this practice may do right now.
 *
 * During the trial every feature is on — the trial has to be the product, not a
 * teaser, because the README's activation metric is a real signed note inside
 * ten minutes.
 */
export function entitlement(facts: BillingFacts, now: Date): Entitlement {
  const plan = PLANS[facts.plan] ?? PLANS.solo;
  const trialEndsAt = facts.trialEndsAt;
  const trialing = Boolean(trialEndsAt && trialEndsAt.getTime() > now.getTime());
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86_400_000))
    : 0;

  const subscribed = Boolean(facts.stripeSubscriptionId);
  const declared = facts.billingState ?? (subscribed ? "active" : null);

  let state: BillingState;
  if (trialing) state = "trialing";
  else if (declared === "canceled" || !subscribed) state = "canceled";
  else if (declared === "past_due") state = "past_due";
  else state = "active";

  // Past due is only read-only once the grace window has actually elapsed, and
  // the window is a stamped date so it cannot silently reset on every render.
  const graceExpired = Boolean(
    facts.graceEndsAt && facts.graceEndsAt.getTime() <= now.getTime(),
  );
  const readOnly =
    state === "canceled" || (state === "past_due" && graceExpired);

  const full = trialing;
  return {
    plan,
    state,
    trialing,
    trialDaysLeft,
    noteLimit: full ? null : plan.noteLimit,
    modalityTemplates: full || plan.modalityTemplates,
    amendments: full || plan.amendments,
    readOnly,
    notice: noticeFor(state, trialDaysLeft, readOnly, facts.graceEndsAt ?? null),
  };
}

function noticeFor(
  state: BillingState,
  trialDaysLeft: number,
  readOnly: boolean,
  graceEndsAt: Date | null,
): string | null {
  if (state === "trialing") {
    if (trialDaysLeft <= 3) {
      return `${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left in your trial. Your signed notes stay yours either way.`;
    }
    return null;
  }
  if (state === "past_due") {
    if (readOnly) {
      return "Payment failed and the grace period has ended. Capture is paused; every signed note stays readable and exportable.";
    }
    const until = graceEndsAt
      ? ` You have until ${graceEndsAt.toISOString().slice(0, 10)}.`
      : "";
    return `A payment did not go through.${until} Nothing is locked yet.`;
  }
  if (state === "canceled") {
    return "No active subscription. Capture is paused; your signed notes remain readable and exportable, always.";
  }
  return null;
}

/* ------------------------------------------------------------------- meter */

export interface MeterState {
  used: number;
  limit: number | null;
  remaining: number | null;
  /** Over the line: capture is refused, review of existing drafts is not. */
  exceeded: boolean;
  /** Within the last 5 notes of a capped plan. */
  nearLimit: boolean;
  label: string;
}

/** The usage meter shown on Solo (and on every plan during the trial). */
export function meter(used: number, limit: number | null): MeterState {
  if (limit === null) {
    return {
      used,
      limit: null,
      remaining: null,
      exceeded: false,
      nearLimit: false,
      label: `${used} ${used === 1 ? "note" : "notes"} this period · unlimited`,
    };
  }
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    exceeded: used >= limit,
    nearLimit: remaining <= 5,
    label: `${used} of ${limit} notes this period`,
  };
}

export interface CaptureGate {
  allowed: boolean;
  /** Machine-readable so the API can answer 402 vs 403 correctly. */
  reason?: "read_only" | "note_limit";
  message?: string;
}

/**
 * May this practice start another note right now? The one gate on capture.
 * Existing drafts are never affected by the answer.
 */
export function canCapture(ent: Entitlement, usedThisPeriod: number): CaptureGate {
  if (ent.readOnly) {
    return {
      allowed: false,
      reason: "read_only",
      message:
        "Capture is paused while billing is unresolved. Existing notes stay reviewable, signable and exportable.",
    };
  }
  const m = meter(usedThisPeriod, ent.noteLimit);
  if (m.exceeded) {
    return {
      allowed: false,
      reason: "note_limit",
      message: `You have used all ${m.limit} notes on ${ent.plan.name} this period. Upgrade to Caseload for unlimited notes — every draft you already have stays reviewable.`,
    };
  }
  return { allowed: true };
}

/** Is this modality allowed on the plan? General is always allowed. */
export function canUseModality(ent: Entitlement, modality: string): boolean {
  if (modality === "general") return true;
  return ent.modalityTemplates;
}

export function planLabel(plan: Plan): string {
  return PLANS[plan]?.name ?? plan;
}
