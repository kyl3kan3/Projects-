/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 58): "The no-show that paid for
 * itself." — a phone-frame booking page books "Thursday 6:00pm", the
 * card saves with the policy panel visible, the appointment row flips
 * to NO-SHOW at 6:12pm, and the protection ledger ticks +$32.50 per the
 * agreed policy. Four beats, then hold on the ledger.
 *
 * The enemy (first section, verbatim from README): the 7pm no-show that
 * cost a night's pay and got a shrug.
 *
 * One CTA phrase, used verbatim everywhere: "Claim your booking page".
 *
 * TODO:
 * - [ ] Hero: handle-claim input (chairflow.io/b/yourname) as the CTA
 *       form; the device animating beside it (CSS keyframes;
 *       prefers-reduced-motion holds the final frame).
 * - [ ] Sections: policy panel close-up (the agreement moment), fee
 *       capture with dispute-ready metadata, cadence nudges with
 *       receipts, the shop rent grid, pricing (three tiers), honest FAQ
 *       (what we charge, what Stripe charges, who holds the money).
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">ChairFlow</p>
      <h1 className="t-display">The no-show that paid for itself.</h1>
      <p className="t-body mt-4">
        Not implemented: booking-page device, policy panel, protection ledger, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Claim your booking page
      </button>
    </main>
  );
}
