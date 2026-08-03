/**
 * src/lib/policy.ts
 *
 * The policy engine's arithmetic, as pure functions.
 *
 * This is the product. Every number a client is ever charged is computed here, from
 * the version of the policy they agreed to at booking — never from the policy as it
 * stands today. Editing a policy appends version N+1 and leaves every existing
 * appointment pointing at the version it was booked under, which is the whole reason
 * the table is append-only.
 *
 * Money is integer cents. A fee is rounded once, here, and never again.
 */

/** A service's deposit rule, as stored in `services.deposit_rule` (jsonb). */
export type DepositRule =
  | { kind: "none" }
  | { kind: "flat"; cents: number }
  | { kind: "percent"; percent: number };

export function parseDepositRule(raw: unknown): DepositRule {
  if (!raw || typeof raw !== "object") return { kind: "none" };
  const r = raw as Record<string, unknown>;
  if (r.kind === "flat" && typeof r.cents === "number" && r.cents > 0) {
    return { kind: "flat", cents: Math.round(r.cents) };
  }
  if (r.kind === "percent" && typeof r.percent === "number" && r.percent > 0) {
    return { kind: "percent", percent: Math.min(100, Math.round(r.percent)) };
  }
  return { kind: "none" };
}

/**
 * What this service asks for at booking, in cents.
 *
 * Capped at the service price: a 100%-deposit rule is a prepaid service, and a rule
 * that somehow exceeded the price would be taking money for nothing.
 */
export function depositFor(rule: DepositRule, priceCents: number): number {
  if (rule.kind === "none") return 0;
  const raw =
    rule.kind === "flat" ? rule.cents : Math.round((priceCents * rule.percent) / 100);
  return Math.max(0, Math.min(priceCents, raw));
}

export function depositRuleLabel(rule: DepositRule, priceCents: number): string {
  if (rule.kind === "none") return "No deposit";
  const cents = depositFor(rule, priceCents);
  if (rule.kind === "flat") return `$${(cents / 100).toFixed(2)} deposit`;
  return `${rule.percent}% deposit ($${(cents / 100).toFixed(2)})`;
}

/** The fields of a policy version that the arithmetic needs. */
export interface PolicyTerms {
  version: number;
  cancelWindowHours: number;
  lateCancelFeePercent: number;
  noShowFeePercent: number;
}

export type FeeKind = "no_show_fee" | "late_cancel_fee";

export function feePercentFor(terms: PolicyTerms, kind: FeeKind): number {
  return kind === "no_show_fee" ? terms.noShowFeePercent : terms.lateCancelFeePercent;
}

export interface FeeComputation {
  kind: FeeKind;
  policyVersion: number;
  percent: number;
  /** The full fee the policy names. */
  feeCents: number;
  /** How much of it the deposit already covers. Never more than the fee. */
  depositAppliedCents: number;
  /** What has to be charged to the card on file. Can be zero. */
  chargeCents: number;
  /** Deposit money beyond the fee, which is owed back to the client. */
  depositRefundCents: number;
}

/**
 * Deposit-first fee math.
 *
 * A deposit already held is applied before anything is charged — holding money
 * beats charging later, and a client who put $20 down on a $45 cut owes $2.50 on a
 * 50% no-show, not $22.50. Where the deposit exceeds the fee the excess is a refund,
 * not a windfall: `depositRefundCents` is what the stylist owes back.
 */
export function computeFee(input: {
  priceCents: number;
  depositCents: number;
  terms: PolicyTerms;
  kind: FeeKind;
}): FeeComputation {
  const percent = Math.max(0, Math.min(100, feePercentFor(input.terms, input.kind)));
  const price = Math.max(0, Math.round(input.priceCents));
  const deposit = Math.max(0, Math.round(input.depositCents));
  const feeCents = Math.round((price * percent) / 100);
  const depositAppliedCents = Math.min(deposit, feeCents);
  return {
    kind: input.kind,
    policyVersion: input.terms.version,
    percent,
    feeCents,
    depositAppliedCents,
    chargeCents: feeCents - depositAppliedCents,
    depositRefundCents: deposit - depositAppliedCents,
  };
}

/**
 * What a cancellation costs, decided by the clock against the agreed window.
 *
 * The window is measured from the appointment's start: "cancel free until 24h
 * before". A cancellation at exactly the boundary is free — the client who read the
 * policy and acted on it should not lose a coin toss with the server's clock.
 */
export type CancellationOutcome = "free" | "late_cancel";

export function cancellationOutcome(input: {
  startsAt: Date;
  now: Date;
  cancelWindowHours: number;
}): CancellationOutcome {
  const hoursOut =
    (input.startsAt.getTime() - input.now.getTime()) / 3_600_000;
  return hoursOut >= input.cancelWindowHours ? "free" : "late_cancel";
}

export function hoursUntil(startsAt: Date, now: Date): number {
  return (startsAt.getTime() - now.getTime()) / 3_600_000;
}

/**
 * The policy text a stylist starts from — a template to edit, never a blank field.
 *
 * It is generated from the numbers so the words and the arithmetic cannot drift
 * apart on day one. After that it is the stylist's own prose: the engine only ever
 * reads the numbers, and the text is what the client agreed to.
 */
export function defaultPolicyText(terms: {
  cancelWindowHours: number;
  lateCancelFeePercent: number;
  noShowFeePercent: number;
}): string {
  const w = terms.cancelWindowHours;
  return [
    `Cancel or reschedule free up to ${w} hours before your appointment.`,
    `Inside ${w} hours, a late-cancellation fee of ${terms.lateCancelFeePercent}% of the service price applies.`,
    `If you do not show up, a no-show fee of ${terms.noShowFeePercent}% of the service price applies.`,
    `Your card is kept on file securely with Stripe and is only charged under this policy. Any deposit you paid is applied to the fee first.`,
  ].join("\n\n");
}

/** Three starting points offered in onboarding, so nobody types a policy from scratch. */
export const POLICY_TEMPLATES: Array<{
  id: string;
  name: string;
  blurb: string;
  cancelWindowHours: number;
  lateCancelFeePercent: number;
  noShowFeePercent: number;
}> = [
  {
    id: "standard",
    name: "Standard",
    blurb: "24 hours, 25% late cancel, 50% no-show. What most chairs run.",
    cancelWindowHours: 24,
    lateCancelFeePercent: 25,
    noShowFeePercent: 50,
  },
  {
    id: "gentle",
    name: "Gentle",
    blurb: "12 hours, no late-cancel fee, 25% no-show. For a book of regulars.",
    cancelWindowHours: 12,
    lateCancelFeePercent: 0,
    noShowFeePercent: 25,
  },
  {
    id: "firm",
    name: "Firm",
    blurb: "48 hours, 50% late cancel, 100% no-show. For long colour appointments.",
    cancelWindowHours: 48,
    lateCancelFeePercent: 50,
    noShowFeePercent: 100,
  },
];

/** A one-line summary of the terms, for the booking page's header and receipts. */
export function policySummary(terms: PolicyTerms): string {
  const parts = [`Cancel free until ${terms.cancelWindowHours}h before`];
  if (terms.lateCancelFeePercent > 0) {
    parts.push(`Late cancel ${terms.lateCancelFeePercent}%`);
  }
  parts.push(`No-show ${terms.noShowFeePercent}%`);
  return `${parts.join(". ")}.`;
}

/**
 * The metadata every fee PaymentIntent carries.
 *
 * Assembled once, here, so a dispute response is a copy-paste rather than an
 * archaeology project: Stripe's evidence fields want exactly this — what was agreed,
 * when, and what it applied to.
 */
export function feeMetadata(input: {
  appointmentId: string;
  clientName: string;
  serviceName: string;
  startsAtIso: string;
  policyVersion: number;
  policyAgreedAtIso: string;
  computation: FeeComputation;
}): Record<string, string> {
  const c = input.computation;
  return {
    chairflow_appointment_id: input.appointmentId,
    chairflow_kind: c.kind,
    chairflow_client: input.clientName,
    chairflow_service: input.serviceName,
    chairflow_appointment_at: input.startsAtIso,
    chairflow_policy_version: String(input.policyVersion),
    chairflow_policy_agreed_at: input.policyAgreedAtIso,
    chairflow_fee_percent: String(c.percent),
    chairflow_fee_cents: String(c.feeCents),
    chairflow_deposit_applied_cents: String(c.depositAppliedCents),
  };
}
