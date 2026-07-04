/**
 * src/lib/close-package.ts
 *
 * Monthly close package assembly: the PDF cover summary, the CSV exports,
 * and the ZIP of source images. Produces the artifact an accountant
 * receives; called from the monthly-close worker job.
 *
 * TODO:
 * - [ ] buildPeriodSummary(orgId, period): totals by category,
 *       month-over-month deltas, flagged/unreviewed counts, document count,
 *       missing-receipt gaps (recurring vendors with no document this
 *       period). Stored on close_periods.summary.
 * - [ ] renderCoverPdf(summary): pdf-lib render following DESIGN.md's
 *       close-package layout -- mono figures, category table with hairline
 *       rules, flagged list. No charts in v1.
 * - [ ] assembleZip(orgId, period): cover PDF + generic/QBO/Xero CSVs +
 *       /sources/{date}-{vendor}-{hash8}.{ext} originals streamed from R2.
 * - [ ] closeGate(orgId, period): refuse to close while unresolved
 *       review_items exist unless force=true (which stamps items
 *       "unreviewed" in the summary -- honesty over tidiness).
 * - [ ] Idempotent: re-running a close for the same period replaces the
 *       package atomically and bumps a version marker in the summary.
 */

export interface PeriodSummary {
  period: string;
  documentCount: number;
  flaggedCount: number;
  totalsByCategoryCents: Record<string, number>;
}

export function buildPeriodSummary(): Promise<PeriodSummary> {
  throw new Error("Not implemented");
}
