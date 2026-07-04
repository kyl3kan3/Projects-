/**
 * src/app/kiosk/[location]/page.tsx
 *
 * Kiosk mode -- the counter tablet PWA (DESIGN.md "Kiosk attract
 * screen"). PIN-gated, full-screen, offline-tolerant, never shows the
 * previous signer's data.
 *
 * TODO:
 * - [ ] PIN entry against locations.kiosk_pin; kiosk session holds a
 *       location-scoped token only (no staff session, no dashboard
 *       access).
 * - [ ] Attract screen per DESIGN.md: slab card, venue name Display,
 *       "Tap to sign the waiver", the trail blaze at 48px, mono sync
 *       indicator (`SYNCED · 09:41` / `3 QUEUED` + wifi-off).
 * - [ ] Launch signing sessions into the /sign flow (kiosk variant:
 *       56px targets, 18px body).
 * - [ ] Auto-reset 8s after the blaze (any tap cancels); hard-clear all
 *       form state between signers (walk-through test in ROADMAP).
 * - [ ] Service worker + IndexedDB outbox: queue completed signings
 *       offline with offline_key; sync on reconnect; surface queue
 *       depth honestly.
 * - [ ] Wake-lock + fullscreen requests where supported; degrade
 *       gracefully.
 */

export default function KioskPage() {
  throw new Error("Not implemented");
}
