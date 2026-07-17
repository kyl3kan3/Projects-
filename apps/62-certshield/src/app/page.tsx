/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 62): "Expired COIs caught before
 * the claim." — an ACORD form drops in, parses into coverage rows, one
 * row flags deficient with its named sentence, the chasing timeline
 * fires T-30 -> T-14, and a compliant replacement lands as the seal
 * presses. Four beats, hold on the compliant matrix.
 *
 * The enemy (first section, verbatim from README): the COI folder that
 * was current in March.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on file stock: enemy line as headline, the device running
 *       its four beats (CSS keyframes; reduced-motion holds the sealed
 *       frame).
 * - [ ] Sections: the deficiency sentence close-up, the chase timeline,
 *       the binder export, parse-honesty explainer (what a human
 *       reviews), pricing, honest FAQ.
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">CertShield</p>
      <h1 className="t-display">Expired COIs caught before the claim.</h1>
      <p className="t-body mt-4">
        Not implemented: parse-verdict device, chase timeline, binder, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
