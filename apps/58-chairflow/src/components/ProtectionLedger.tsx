/**
 * ProtectionLedger — the "paid for itself" surface and the landing
 * device's data source.
 *
 * Rows: fees collected, deposits kept, waives (shown honestly — grace
 * is a feature), waitlist-recovered revenue. The running total settles
 * with the ledger-tick motion from DESIGN.md; numbers are tabular-nums,
 * no meters, no gradients.
 *
 * TODO:
 * - [ ] Props from fees.ledgerSummary(range); range switcher
 *       (month / quarter / all).
 * - [ ] Each row expands to its charge history (status chips:
 *       charged / failed / waived / disputed).
 * - [ ] Empty state: "No protection events yet — your policy starts
 *       working on your next booking."
 */

export interface ProtectionLedgerProps {
  feesCollectedCents: number;
  depositsKeptCents: number;
  waivedCents: number;
  recoveredCents: number;
}

export function ProtectionLedger(props: ProtectionLedgerProps) {
  void props;
  return <div className="ledger">Not implemented</div>;
}
