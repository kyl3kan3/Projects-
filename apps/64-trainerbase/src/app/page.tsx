/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 64): "The program delivered
 * before the gym opens." — a program week assembles row by row in the
 * builder, flips to the phone frame as today's workout, three sets
 * tick with the rest arc running, and the adherence dashboard ticks
 * the client green. Four beats, hold on the dashboard.
 *
 * The enemy (first section, verbatim from README): the spreadsheet
 * named "Mike v3 FINAL".
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero on chalk: enemy line as headline, the device running its
 *       four beats (CSS keyframes; reduced-motion holds the dashboard
 *       frame).
 * - [ ] Sections: the drift flag receipt, substitutions-not-forks,
 *       offline logging honesty, flat-vs-per-client pricing math,
 *       pricing, honest FAQ.
 * - [ ] Single CTA phrase repeated verbatim at every placement.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">TrainerBase</p>
      <h1 className="t-display">The program delivered before the gym opens.</h1>
      <p className="t-body mt-4">
        Not implemented: builder-to-phone device, drift receipt, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
