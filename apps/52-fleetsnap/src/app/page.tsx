/**
 * src/app/page.tsx
 *
 * Marketing landing page. Built LAST, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture:
 * - Enemy: the clipboard -- the inspection that gets pencil-whipped,
 *   lost in a glovebox, and can't testify when the brakes fail or the
 *   auditor calls.
 * - One sentence: "Every truck inspected in 90 seconds, every defect a
 *   ticket, every record one tap from the auditor."
 * - Device: "The pre-trip that takes 90 seconds, not a clipboard."
 *   Rendered as a stopwatch running beside the inspection flow.
 * - CTA phrase, verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero: the machine running -- a driver's thumb tapping through the
 *       walkaround, a cracked-mirror photo landing, the ticket appearing
 *       on the office board in the same beat (beat 1 of 4).
 * - [ ] The device section: the stopwatch, items ticking, ROADWORTHY
 *       stamping at 1:28 (beat 2).
 * - [ ] The math: one roadside breakdown ($1,500-3,000 + the lost
 *       crew-day) vs $199/mo; the per-vehicle meter at 30 vehicles vs one
 *       flat number (beat 3).
 * - [ ] Receipts (Law 5): our own dogfooded inspections on our own
 *       vehicles, clearly framed -- never fabricated.
 * - [ ] Objection killer: "My drivers won't use an app" -> they don't
 *       install one; a text-message link opens the walkaround.
 * - [ ] Pricing anchored; the CTA phrase repeated verbatim at hero /
 *       post-proof / post-pricing / sticky mobile bar (beat 4: the offer).
 * - [ ] Four animated beats total; everything else static; sub-2s LCP.
 */

const DEVICE_LINE = "The pre-trip that takes 90 seconds, not a clipboard.";
const CTA_PHRASE = "Start free — 14 days";

export default function LandingPage() {
  return (
    <main>
      <h1>{DEVICE_LINE}</h1>
      <p>
        Drivers tap through photo-verified walkarounds on their phones.
        Defects open maintenance tickets before the truck leaves the yard.
        The audit is a download, not a weekend.
      </p>
      <a href="/signup">{CTA_PHRASE}</a>
    </main>
  );
}
