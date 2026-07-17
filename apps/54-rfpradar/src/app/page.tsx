/**
 * Marketing landing page.
 *
 * The device (MARKETING_PLAYBOOK row 54): "The tender you'd have missed,
 * found at 6am." — a live morning-scan card typesetting itself: the scan
 * header stamps the date, three match rows print in score order (score,
 * title, agency, due date), the factors of the top match reveal line by
 * line, then the quiet footer line ("3,412 notices scanned across 6
 * sources") settles. Four beats, then hold.
 *
 * The enemy (first section, verbatim from README): the RFP you found on
 * the day questions were due.
 *
 * One CTA phrase, used verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero: product name small-caps, the enemy line as the headline,
 *       the scan-card device animating through its four beats
 *       (CSS keyframes, prefers-reduced-motion collapses to final frame).
 * - [ ] Sections: how scoring works (factors verbatim — screenshot the
 *       real MatchCard), the go/no-go scorecard, the answer library
 *       snapshot semantics, pricing (three tiers), honest FAQ.
 * - [ ] Single CTA button (btn-primary) repeating the exact phrase.
 */

export default function LandingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <p className="t-placard">RFPRadar</p>
      <h1 className="t-display">The tender you&apos;d have missed, found at 6am.</h1>
      <p className="t-body mt-4">
        Not implemented: morning-scan device, scoring factors, scorecard, pricing.
      </p>
      <button className="btn btn-primary mt-8" type="button">
        Start free — 14 days
      </button>
    </main>
  );
}
