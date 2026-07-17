/**
 * src/app/kiosk/[deviceToken]/page.tsx
 *
 * The door tablet. A single-purpose surface: search -> tap -> checked in,
 * in five seconds, with kid-sized targets and offline resilience.
 *
 * TODO:
 * - [ ] Verify the device token server-side; revoked/invalid renders the
 *       "device deactivated — see the front desk" screen.
 * - [ ] Per DESIGN.md kiosk spec: 24px gutter, 56px search input (18px
 *       text), result cards with photo + belt bar, the kiosk student card
 *       (radius 20, name 28/700, class chips with nearest class
 *       pre-selected, one primary Check in at 56px height).
 * - [ ] Check-in beats 1-2 (counter tick + progress fill), then
 *       auto-return to search in 2.5s.
 * - [ ] Installable web app; offline check-ins queue locally with client
 *       keys and sync on reconnect; amber "3 check-ins queued — will sync"
 *       banner, never blocking.
 * - [ ] No staff navigation, no tab bar, no way out of the kiosk without
 *       the desk revoking/replacing the token.
 */

export default async function KioskPage(_props: {
  params: Promise<{ deviceToken: string }>;
}) {
  // TODO: implement per DESIGN.md "Mobile layout — Kiosk"
  return null;
}
