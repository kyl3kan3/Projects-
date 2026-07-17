/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 67): "The estimate they approve
 * from the waiting room." — a tablet taps a red verdict with a
 * brake-pad photo, the finding sentence composes with the
 * measurement, the phone frame receives the text link, and two lines
 * approve while one declines with the running total settling. Four
 * beats, hold on the approval record.
 *
 * The enemy (first section, verbatim from README): the clipboard
 * estimate described over phone tag.
 *
 * One CTA phrase, used verbatim everywhere: "Book a 10-minute demo".
 *
 * TODO:
 * - [ ] Hero: graphite-to-paper split device (CSS keyframes;
 *       reduced-motion holds the approval frame).
 * - [ ] Sections: the finding-sentence close-up, the authorization
 *       trail receipt, declined-work follow-ups, works-beside-your-
 *       SMS, flat pricing, honest FAQ.
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">WrenchView</p>
      <h1 className="t-display">The estimate they approve from the waiting room.</h1>
      <p className="t-body mt-4">
        Not implemented: bay-to-phone device, authorization receipt, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Book a 10-minute demo
      </button>
    </main>
  );
}
