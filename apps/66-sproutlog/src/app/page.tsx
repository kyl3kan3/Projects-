/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 66): "The daily sheet parents
 * actually read." — a thumb taps four moments (arrival, lunch with
 * components, nap start/end, diaper), the digest composes itself
 * sentence by sentence in a phone frame, and sends at 5:02pm with the
 * photo. Four beats, hold on the digest.
 *
 * The enemy (first section, verbatim from README): the paper daily
 * sheet that dies in a diaper bag.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on cream: enemy line as headline, the tap-to-digest
 *       device with the bloom + ribbon (CSS keyframes;
 *       reduced-motion holds the digest frame).
 * - [ ] Sections: the CACFP table receipt, tuition autopay (the
 *       Friday text, retired), the binder, pricing, honest FAQ (no
 *       curriculum/assessment theater).
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">SproutLog</p>
      <h1 className="t-display">The daily sheet parents actually read.</h1>
      <p className="t-body mt-4">
        Not implemented: tap-to-digest device, CACFP receipt, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
