/**
 * src/lib/award.ts
 *
 * Award flow: pick the winner, lock the record, notify everyone.
 *
 * TODO:
 * - [ ] awardPackage(packageId, bidId, note): confirm-gate checks
 *       (unmapped lines? unanswered questions? plugs above threshold?)
 *       surfaced to the UI before commit.
 * - [ ] Commit: insert awards row, set trade_packages.awarded_bid_id +
 *       status, freeze bids read-only, write audit_log.
 * - [ ] notify(packageId): award notice to the winner, regret notices to
 *       other bidders (editable templates, default on); stamp
 *       notifications_sent_at; respect DRY_RUN.
 * - [ ] unaward(packageId, reason): rare but real (sub backs out);
 *       reopens the package, preserves the prior award in history.
 * - [ ] Project rollup: all packages awarded -> project status awarded.
 */

export function awardPackage(): Promise<void> {
  throw new Error("Not implemented");
}
