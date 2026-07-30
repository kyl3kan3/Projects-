/**
 * src/app/crew/[token]/page.tsx
 *
 * The crew flow -- the product. A foreman's signed link opens the week's
 * talk; the phone gets handed around the huddle. Linear, no nav, offline-
 * tolerant, glove-sized targets. DESIGN.md "Crew flow" is the spec.
 *
 * TODO:
 * - [ ] Verify crew token (jose); typed error screens (expired link asks
 *       ops for a resend, never dead-ends a jobsite).
 * - [ ] Screen 1 — the talk: hazard Label, Title, Body at 17/1.6, optional
 *       huddle-photo button, thumb-zone **Start sign-off**.
 * - [ ] Screen 2 — roster: tap-your-name rows (48px targets), signed rows
 *       flip to green check + mono time.
 * - [ ] Screen 3 — signature pad per person (signature_pad, vector
 *       strokes, the hardhat baseline rule), auto-advance through queue.
 * - [ ] The sign-off stamp signature animation + reduced-motion fallback.
 * - [ ] Done screen: "8 of 8 signed · 07:19" + sync status (cloud-off /
 *       cloud-up / synced counts from lib/offline).
 * - [ ] Everything writes through the IndexedDB outbox (lib/offline) --
 *       online or not; precache on first load via the service worker.
 * - [ ] GPS stamp requested politely (denied != blocked).
 */

export default function CrewPage() {
  return null; // TODO: implement
}
