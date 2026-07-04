/**
 * src/lib/autopay.ts
 *
 * Autopay enrollment and the due-date charge run -- the wedge feature
 * that makes the check-chase disappear.
 *
 * TODO:
 * - [ ] enroll(householdId, paymentMethodId, method): after SetupIntent
 *       succeeds (portal, behind magic-link step-up); one active
 *       enrollment per household; audit-logged.
 * - [ ] chargeRun(dueDate): cron entry -- find due invoices with active
 *       enrollments, chargeAutopay per invoice (idempotent), record
 *       outcomes. Batch-safe: a crashed run resumes without double
 *       charging (idempotency keys are the guarantee, test it).
 * - [ ] Failure ladder: first failure -> retry at +3 days; second ->
 *       enrollment status failed + treasurer notified + invoice degrades
 *       to the normal reminder ladder. Never a silent gap.
 * - [ ] pause/resume(householdId) for snowbirds and disputes.
 * - [ ] enrollmentStats(associationId): the wedge metric (enrolled % of
 *       households) for the dashboard and our own north-star analytics.
 */

export function enroll(): Promise<void> {
  throw new Error("Not implemented");
}

export function chargeRun(_dueDate: Date): Promise<void> {
  throw new Error("Not implemented");
}
