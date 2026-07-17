/**
 * src/app/page.tsx
 *
 * Marketing landing page. Built LAST, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture:
 * - Enemy: the silent undercut -- the competitor's Tuesday-night price
 *   drop you discover from a Friday sales dip.
 * - One sentence: "Know your price position on every SKU before your
 *   first coffee, without trusting a robot with your prices."
 * - Device: "Your price position while you slept." Rendered as the
 *   morning digest assembling itself.
 * - CTA phrase, verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero: the machine running -- a rival's price ticks down at
 *       2:14am, the alert posts to Slack, the ladder re-sorts (beat 1 of
 *       4). Claim: "They moved at 2am. You knew at 7." De-risk line:
 *       "No card required. Read-only, always."
 * - [ ] The device section: the digest assembling -- timestamp line,
 *       prices ticking, the marker sliding, the UNDERCUT chip landing
 *       (beat 2).
 * - [ ] The math: one hero SKU undercut for two unnoticed weeks vs
 *       $49/mo; the 20-minute tab-click ritual x 22 workdays (beat 3).
 * - [ ] Receipts (Law 5): live extraction previews on real public pages,
 *       our own tracked test catalog with real timestamps -- never
 *       fabricated.
 * - [ ] Objection killer: "I don't want software repricing my store" ->
 *       no write access, by architecture; suggestions show reasoning and
 *       wait.
 * - [ ] Pricing anchored vs Prisync's $99 floor; the CTA phrase repeated
 *       verbatim at hero / post-proof / post-pricing / sticky mobile bar
 *       (beat 4: the offer).
 * - [ ] Four animated beats total; everything else static; sub-2s LCP.
 */

const DEVICE_LINE = "Your price position while you slept.";
const CTA_PHRASE = "Start free — 14 days";

export default function LandingPage() {
  return (
    <main>
      <h1>{DEVICE_LINE}</h1>
      <p>
        Track rival product pages, get the alert when a price moves, and see
        your position on every SKU each morning. Suggestions only -- nothing
        ever touches your store.
      </p>
      <a href="/signup">{CTA_PHRASE}</a>
    </main>
  );
}
