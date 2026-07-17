/**
 * /a/[token] — manage appointment (client-facing, tokenized).
 *
 * Reschedule or cancel via the signed manage link from the confirmation.
 * The policy window does the talking: inside the free window both
 * actions are instant (and free the slot for the waitlist); inside the
 * fee window the page states the consequence plainly BEFORE the tap
 * ("Cancelling now is within 24h — a 25% fee applies per the policy you
 * agreed to") — no surprise charges, ever.
 *
 * TODO:
 * - [ ] verifyToken("manage", token) -> appointment or a calm expired
 *       page with the stylist's contact.
 * - [ ] Reschedule = pick from openSlots; cancel = confirm with the
 *       stated consequence; both notify the stylist.
 */

export default async function ManageAppointmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="t-h2">Your appointment</h1>
      <p className="t-secondary mt-4">Not implemented: reschedule / cancel with policy window.</p>
    </main>
  );
}
