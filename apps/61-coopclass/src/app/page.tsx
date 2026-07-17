/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 61): "Registration night without
 * the folding-table chaos." — the clock hits 7:00pm, three family
 * cards flow through the same class list, capacity stamps tick
 * 8/12 -> 11/12, one class stamps FULL and flips its waitlist on, and
 * the Hernandez siblings land in four conflict-free periods with the
 * discount math computing in the footer. Four beats, hold on the
 * settled schedule.
 *
 * The enemy (first section, verbatim from README): the shared
 * spreadsheet at the folding table.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on cream: enemy line as headline (Source Serif), the
 *       device animating its four beats (CSS keyframes;
 *       reduced-motion holds the settled frame).
 * - [ ] Sections: the conflict sentence receipt, discount lines
 *       close-up, the binder, the digest, pricing (+ summer pause),
 *       honest FAQ.
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">CoopClass</p>
      <h1 className="t-display">Registration night without the folding-table chaos.</h1>
      <p className="t-body mt-4">
        Not implemented: registration device, discount receipt, binder, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
