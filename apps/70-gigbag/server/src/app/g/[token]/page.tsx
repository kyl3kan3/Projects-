/**
 * /g/[token] — the booker page (DESIGN.md screen 8).
 *
 * Gig details, the contract reading view, signature capture, the
 * deposit payment — clean enough to forward to a wedding planner.
 * Mobile-first, no account.
 *
 * TODO: token verify; contract render; signature canvas + hash;
 * Stripe Elements on the band's Connect account; signed/paid states.
 */

export default async function BookerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="t-h2">Confirm your booking</h1>
      <p className="t-secondary mt-4">Not implemented: contract, signature, deposit.</p>
    </main>
  );
}
