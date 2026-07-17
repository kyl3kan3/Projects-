/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 69): "The lien clock that runs
 * itself." — the unit map breathes (one unit flips overdue at day 6),
 * the late ladder steps fire (fee, overlock flag), the lien timeline
 * unrolls with statutory steps and the certified-mail notice
 * generating, and the hard stop renders ("Sale eligible June 28 —
 * not before"). Four beats, hold on the timeline.
 *
 * The enemy (first section, verbatim from README): the lien deadline
 * computed on a napkin.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on concrete: enemy line as headline, the map-to-rail
 *       device running its four beats (CSS keyframes; reduced-motion
 *       holds the timeline frame).
 * - [ ] Sections: the citation receipt, the generated notice, the
 *       ten-minute move-in, autopay + ladder, pricing, honest FAQ
 *       (no gate hardware in v1; not legal advice).
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">UnitKeeper</p>
      <h1 className="t-display">The lien clock that runs itself.</h1>
      <p className="t-body mt-4">
        Not implemented: map device, lien rail, notice receipt, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
