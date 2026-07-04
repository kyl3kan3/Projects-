/**
 * src/lib/reminders.ts
 *
 * The delinquency reminder ladder: configurable, idempotent, humane.
 * Neighbors are chasing neighbors -- default copy is firm but never nasty.
 *
 * TODO:
 * - [ ] Ladder config per association (settings jsonb): default
 *       +3d gentle email, +14d firm email, +30d board flag + SMS (opted-in
 *       only); fully editable copy with merge tags.
 * - [ ] reminderSweep(now): daily cron -- walk overdue invoices, send the
 *       rung each has newly crossed, record deliveries; idempotent under
 *       double-fire (rung recorded per invoice).
 * - [ ] applyLateFees(now): grace-expiry sweep calling
 *       invoicing.applyLateFee per policy; separate from sends so a fee
 *       is never contingent on an email succeeding.
 * - [ ] agingBuckets(associationId): current/30/60/90+ household rollups
 *       for the delinquency view and announcement segments.
 * - [ ] 90+ behavior: surface "export history for your attorney" -- no
 *       automatic legal escalation, ever (README risk #4).
 * - [ ] paymentPlan(householdId, splits): balance -> scheduled invoices
 *       through the normal pipeline; plan state visible on the household.
 */

export function reminderSweep(_now: Date): Promise<number> {
  throw new Error("Not implemented");
}

export function agingBuckets(): Promise<unknown> {
  throw new Error("Not implemented");
}
