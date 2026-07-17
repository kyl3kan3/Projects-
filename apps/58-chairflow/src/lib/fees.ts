/**
 * src/lib/fees.ts
 *
 * The protection engine: deposits and no-show/late-cancel fees on the
 * STYLIST'S OWN Stripe Connect Express account. Client money never
 * touches the platform balance.
 *
 * Every charge carries dispute-ready metadata: policy version, the
 * policy_agreed_at timestamp, appointment id/time/service — assembled
 * here, once, so a dispute response is a copy-paste.
 *
 * TODO:
 * - [ ] computeFee(appointment, kind): deposit-first math — the kept
 *       deposit offsets the fee; remainder charges off-session.
 * - [ ] captureFee(appointmentId, kind): PaymentIntent (off_session,
 *       confirm) on the Connect account with idempotency key
 *       `appointment:{id}:fee`; write the charges row; failures store
 *       failure_reason and surface a hosted retry link.
 * - [ ] waiveFee(chargeId, userId): one tap; status "waived",
 *       audit_log entry; receipts quote the agreed policy text.
 * - [ ] ledgerSummary(stylistId, range): fees collected, deposits kept,
 *       waives, recovered-by-waitlist — the "paid for itself" number.
 */

export interface FeeComputation {
  feeCents: number;
  depositAppliedCents: number;
  remainderCents: number;
  policyVersion: number;
}

export async function computeFee(
  appointmentId: string,
  kind: "no_show_fee" | "late_cancel_fee",
): Promise<FeeComputation> {
  throw new Error("Not implemented");
}

export async function captureFee(
  appointmentId: string,
  kind: "no_show_fee" | "late_cancel_fee",
): Promise<{ chargeId: string; status: "charged" | "failed" }> {
  throw new Error("Not implemented");
}

export async function waiveFee(chargeId: string, userId: string): Promise<void> {
  throw new Error("Not implemented");
}
