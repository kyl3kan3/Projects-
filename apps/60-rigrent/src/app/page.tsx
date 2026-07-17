/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 60): "Double-booked never again."
 * — a quote line for "40 x white folding chair" types in, the chalk
 * gauge for that Saturday fills 32/40, the quantity ticks to 48, the
 * line blocks in rust with the conflicting order named, then resolves
 * at 40 and the quote confirms. Four beats, hold on the confirmed
 * order.
 *
 * The enemy (first section, verbatim from README): the whiteboard that
 * promised the same 40 chairs to two Saturdays.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on kraft: enemy line as headline, the gauge device
 *       animating its four beats (CSS keyframes; reduced-motion holds
 *       the resolved frame).
 * - [ ] Sections: the availability query explained in one sentence,
 *       deposit holds (money never moves unless documented), the photo
 *       pair, run sheets, pricing, honest FAQ.
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">RigRent</p>
      <h1 className="t-display">Double-booked never again.</h1>
      <p className="t-body mt-4">
        Not implemented: gauge device, deposit holds, photo pairs, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
