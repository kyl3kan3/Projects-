/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 68): "The tip pool no one argues
 * about." — a shift's numbers import ($1,842 pool), the rules apply
 * visibly (points x hours cascading), four staff lines compute with
 * their math expanded, and one server's transparency page renders on
 * a phone with her derivation. Four beats, hold on the shown math.
 *
 * The enemy (first section, verbatim from README): the manager's
 * midnight spreadsheet.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on receipt stock: enemy line as headline, the derivation
 *       device running its four beats (CSS keyframes; reduced-motion
 *       holds the shown-math frame).
 * - [ ] Sections: the derivation receipt, effective-dated rules, the
 *       dispute window, payroll export + lock, we-don't-move-money,
 *       pricing, honest FAQ.
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">TipTally</p>
      <h1 className="t-display">The tip pool no one argues about.</h1>
      <p className="t-body mt-4">
        Not implemented: derivation device, shown-math receipt, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
