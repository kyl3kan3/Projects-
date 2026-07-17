/**
 * src/app/book/[token]/page.tsx
 *
 * The patient-facing booking-request page — the destination of every
 * campaign touch's link. One screen, no account, no scroll at 390px if
 * possible.
 *
 * TODO:
 * - [ ] Verify the signed token (src/lib/campaigns verifyBookingToken);
 *       expired/invalid -> friendly "call us" fallback with the location's
 *       phone, never an error page.
 * - [ ] Render per DESIGN.md: location name, one friendly line
 *       (booking_notice), preferred-window chips (next two weeks, AM/PM),
 *       phone confirm field, primary "Request a time".
 * - [ ] Submit writes booking_requests tied to the touch; confirmation
 *       state tells the patient the front desk will call to confirm.
 * - [ ] The identical visual theme as the app (porcelain/ink/aqua) — one
 *       practice, one paper.
 * - [ ] No PHI beyond what the token authorizes; page is noindex.
 */

export default async function BookingPage(_props: {
  params: Promise<{ token: string }>;
}) {
  // TODO: implement per ARCHITECTURE.md key flow 3
  return null;
}
