/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 65): "Every deadline on the
 * contract, on one line." — a contract date types in, the timeline
 * unfurls with eleven derived dates snapping into place, the
 * inspection-objection date ghost-shifts as the anchor edits, and the
 * T-3 reminder fires to three parties. Four beats, hold on the full
 * timeline.
 *
 * The enemy (first section, verbatim from README): the critical date
 * that lived only in the contract PDF.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on manila: enemy line as headline (Source Serif), the
 *       DealLine device running its four beats (CSS keyframes;
 *       reduced-motion holds the final frame).
 * - [ ] Sections: derivation sentences close-up, the recompute diff
 *       receipt, the reminder ledger, the party portal, pricing,
 *       honest FAQ (not an e-sign tool).
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">ListingLoop</p>
      <h1 className="t-display">Every deadline on the contract, on one line.</h1>
      <p className="t-body mt-4">
        Not implemented: unfurl device, recompute diff, reminder ledger, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
