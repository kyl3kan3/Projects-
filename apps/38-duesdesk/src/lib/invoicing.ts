/**
 * src/lib/invoicing.ts
 *
 * The dues engine: assessment schedules -> invoice runs -> settlement.
 * Every number here is somebody's neighbor's money; integer cents, full
 * audit, idempotent everything.
 *
 * TODO:
 * - [ ] previewRun(scheduleId, period): "63 invoices totaling $11,340 will
 *       be created for Apr 1" -- the onboarding trust moment; no side
 *       effects.
 * - [ ] generateInvoices(scheduleId, period): one invoice per active
 *       household, idempotent per (household, schedule, period); send
 *       invoice emails with portal links; stamp sent_at.
 * - [ ] applyPayment(invoiceId, payment): from Stripe webhooks OR manual
 *       check/cash recording; partial payments set status partial;
 *       overpayment parks as household credit (post-MVP: credit ledger).
 * - [ ] ACH honesty: payment_intent.processing renders "processing";
 *       succeeded flips paid; a failed ACH after processing reverts with
 *       an audit entry and a treasurer notification -- never silently.
 * - [ ] applyLateFee(invoiceId) / waiveLateFee(invoiceId, reason): fee is
 *       its own line, reversal keeps the record (boards waive constantly).
 * - [ ] specialAssessment(associationId, amount, label): one-time run
 *       through the same pipeline.
 * - [ ] Statement PDF per household (pdf-lib) for the paper-mail holdouts.
 */

export function previewRun(): Promise<{ count: number; totalCents: number }> {
  throw new Error("Not implemented");
}

export function generateInvoices(): Promise<void> {
  throw new Error("Not implemented");
}
