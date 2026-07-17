/**
 * /b/[handle] — the public booking page. The money surface.
 *
 * Opened from an Instagram bio on a phone. Four steps, one screen each,
 * flawless one-handed at 390px: service -> slot -> contact (+ SMS
 * consent) -> payment per the deposit rule. The policy panel renders the
 * stylist's CURRENT policy text verbatim; booking = agreement, stamped
 * as policy_version + policy_agreed_at.
 *
 * No client accounts. Name + phone (+ optional email) only.
 *
 * TODO:
 * - [ ] Server component: stylist by handle (404 unknown), active
 *       services, openSlots for the next 14 days.
 * - [ ] BookingFlow client component (steps, optimistic slot hold,
 *       Stripe Elements on the Connect account).
 * - [ ] Cardless fallback while connect_status = "pending".
 * - [ ] Suspended plan renders "fully booked" — never a broken page.
 */

export default async function BookingPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <p className="t-placard">Book with</p>
      <h1 className="t-h2">@{handle}</h1>
      <p className="t-secondary mt-4">Not implemented: services, slots, policy panel, payment.</p>
    </main>
  );
}
