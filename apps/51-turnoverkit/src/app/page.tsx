/**
 * src/app/page.tsx
 *
 * Marketing landing page. Built LAST, to MARKETING_PLAYBOOK.md.
 *
 * Message architecture:
 * - Enemy: taking "it's done" on faith -- the unverifiable turnover
 *   between two guests.
 * - One sentence: "Every unit photographed clean, scheduled automatically,
 *   before the next guest lands."
 * - Device: "The turnover photographed clean before the next guest lands."
 *   Rendered as a completed turnover record assembling itself.
 * - CTA phrase, verbatim everywhere: "Start free — 14 days".
 *
 * TODO:
 * - [ ] Hero: the machine running -- a booking moves on the calendar, the
 *       turnover re-flows, photos land, the tile flips to VERIFIED (beat 1).
 * - [ ] The device section: the photo strip filling room by room, the
 *       checklist ticking, the tile flipping (beat 2).
 * - [ ] The math: one cleanliness-driven bad review vs $39/mo; one
 *       unclaimable damage incident vs a year of the top tier (beat 3).
 * - [ ] Receipts (Law 5): our own dogfooded turnover records, clearly
 *       framed ("From our own 3-unit test portfolio") -- never fabricated.
 * - [ ] Objection killer: "My cleaners won't use an app" -> they don't
 *       install one; a text-message link opens the checklist.
 * - [ ] Pricing anchored; the CTA phrase repeated verbatim at hero /
 *       post-proof / post-pricing / sticky mobile bar (beat 4: the offer).
 * - [ ] Four animated beats total; everything else static; sub-2s LCP.
 */

const DEVICE_LINE = "The turnover photographed clean before the next guest lands.";
const CTA_PHRASE = "Start free — 14 days";

export default function LandingPage() {
  return (
    <main>
      <h1>{DEVICE_LINE}</h1>
      <p>
        Calendars sync themselves into a turnover schedule. Cleaners work
        photo-verified room-by-room checklists on their phones. You see every
        unit guest-ready before check-in.
      </p>
      <a href="/signup">{CTA_PHRASE}</a>
    </main>
  );
}
