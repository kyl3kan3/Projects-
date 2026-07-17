/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 59): "The load delivered,
 * invoiced, and factored by dinner." — a load card advances booked ->
 * delivered as timestamps stamp in along the hazard thread, the BOL
 * photo drops on, the packet PDF assembles page by page, and the
 * status flips INVOICED with the factoring line beneath. Four beats,
 * hold on the packet.
 *
 * The enemy (first section, verbatim from README): the milk crate of
 * rate confirmations riding shotgun.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on the asphalt ground: enemy line as headline, the device
 *       running its four beats (CSS keyframes; reduced-motion holds the
 *       final packet frame).
 * - [ ] Sections: rate-con-to-load in 60 seconds, the detention clock
 *       with evidence, the packet completeness check, IFTA quarter,
 *       pricing, honest FAQ (what we don't do: load boards, ELD,
 *       filing).
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">DispatchDeck</p>
      <h1 className="t-display">The load delivered, invoiced, and factored by dinner.</h1>
      <p className="t-body mt-4">
        Not implemented: load-card device, packet assembly, detention evidence, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
