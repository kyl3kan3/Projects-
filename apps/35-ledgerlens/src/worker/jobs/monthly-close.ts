/**
 * src/worker/jobs/monthly-close.ts
 *
 * Monthly close job: runs per org on the 1st for the prior period.
 * Produces the close package or the "items need review" nudge.
 *
 * TODO:
 * - [ ] closeGate: unresolved review_items -> send review-nudge email with
 *       deep link, leave period `open`, reschedule check in 48h.
 * - [ ] Clean (or forced): buildPeriodSummary -> renderCoverPdf ->
 *       toGenericCsv/toQboCsv/toXeroCsv -> assembleZip -> upload to R2.
 * - [ ] Flip close_periods to `closed`; send the close email (summary
 *       numbers inline, download link, accountant-share reminder).
 * - [ ] Report metered usage to Stripe for the period (idempotent).
 * - [ ] Emit audit_log rows for close + package creation.
 * - [ ] Idempotent re-close: replaces package, versions the summary.
 */

export function monthlyCloseJob(): Promise<void> {
  throw new Error("Not implemented");
}
