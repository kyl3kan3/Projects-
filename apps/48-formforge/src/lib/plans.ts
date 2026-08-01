/**
 * src/lib/plans.ts
 *
 * Plan definitions and gating.
 *
 * The one rule that matters, from ROADMAP.md's acceptance criteria: **being over
 * cap or out of trial blocks new sends and nothing else.** Reading a packet,
 * exporting a PDF, and pulling the audit log always work. A practice locked out
 * of its own patient records over a billing state would be a records-retention
 * failure, not a growth tactic.
 */

import type { Plan } from "@/db/schema";

export interface PlanDefinition {
  id: Plan;
  name: string;
  priceCents: number;
  clinicianCap: number;
  blurb: string;
  includes: string[];
}

export const PLANS: PlanDefinition[] = [
  {
    id: "solo",
    name: "Solo",
    priceCents: 4900,
    clinicianCap: 1,
    blurb: "One clinician",
    includes: [
      "Unlimited forms and submissions",
      "E-signature with evidence summary",
      "Encrypted storage and audit log",
      "Reminders with quiet hours",
      "PDF export",
    ],
  },
  {
    id: "group",
    name: "Group",
    priceCents: 9900,
    clinicianCap: 5,
    blurb: "Up to 5 clinicians",
    includes: [
      "Everything in Solo",
      "Clinician assignment and routing",
      "Shared template library",
      "Intake status board",
      "EHR-lite CSV export",
    ],
  },
  {
    id: "clinic",
    name: "Clinic",
    priceCents: 14900,
    clinicianCap: 12,
    blurb: "Up to 12 clinicians",
    includes: [
      "Everything in Group",
      "Custom branding",
      "Priority support",
      "Longer retention windows",
    ],
  },
];

export function planDefinition(plan: Plan): PlanDefinition {
  const found = PLANS.find((p) => p.id === plan);
  if (!found) throw new Error(`Unknown plan: ${plan}`);
  return found;
}

export function clinicianCap(plan: Plan): number {
  return planDefinition(plan).clinicianCap;
}

export function priceLabel(plan: Plan): string {
  return `$${planDefinition(plan).priceCents / 100}/mo`;
}

/** Per-clinician monthly cost — the anchor against per-seat EHR pricing. */
export function perClinicianCents(plan: Plan, clinicians: number): number {
  const def = planDefinition(plan);
  const n = Math.max(1, Math.min(clinicians, def.clinicianCap));
  return Math.round(def.priceCents / n);
}

export interface SendGate {
  /** May the practice send a NEW intake right now? */
  canSend: boolean;
  /** Why not, in the words the screen shows. */
  reason: string | null;
  trialDaysLeft: number | null;
  clinicians: number;
  cap: number;
}

/**
 * Can this practice send another packet?
 *
 * Three ways to be blocked, and each one names itself so the UI never has to
 * guess: over the clinician cap, an expired trial with no subscription, or a
 * subscription Stripe has told us is unpaid.
 */
export function sendGate(input: {
  plan: Plan;
  clinicians: number;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
  now?: Date;
}): SendGate {
  const now = input.now ?? new Date();
  const cap = clinicianCap(input.plan);
  const active = ["active", "trialing", "past_due"].includes(input.subscriptionStatus ?? "");
  const trialMs = input.trialEndsAt ? input.trialEndsAt.getTime() - now.getTime() : null;
  const trialDaysLeft = trialMs === null ? null : Math.max(0, Math.ceil(trialMs / 86_400_000));

  if (input.clinicians > cap) {
    return {
      canSend: false,
      reason: `Your ${input.plan} plan covers ${cap} clinician${cap === 1 ? "" : "s"} and this practice has ${input.clinicians}. Reading and exporting are unaffected.`,
      trialDaysLeft,
      clinicians: input.clinicians,
      cap,
    };
  }

  if (input.subscriptionStatus === "canceled" || input.subscriptionStatus === "unpaid") {
    return {
      canSend: false,
      reason: "Your subscription is not active. Existing packets, exports and the audit log still open.",
      trialDaysLeft,
      clinicians: input.clinicians,
      cap,
    };
  }

  if (!active && trialMs !== null && trialMs <= 0) {
    return {
      canSend: false,
      reason: "Your 14-day trial has ended. Choose a plan to send new packets — your records stay readable.",
      trialDaysLeft: 0,
      clinicians: input.clinicians,
      cap,
    };
  }

  return { canSend: true, reason: null, trialDaysLeft, clinicians: input.clinicians, cap };
}

/** Branding customisation is a Clinic-tier feature. */
export function canCustomiseBranding(plan: Plan): boolean {
  return plan === "clinic";
}

/** CSV export is a Group-and-up feature (README pricing table). */
export function canExportCsv(plan: Plan): boolean {
  return plan === "group" || plan === "clinic";
}
