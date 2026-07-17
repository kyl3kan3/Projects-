/**
 * /s/[token] — the staff transparency page (DESIGN.md screen 5).
 *
 * Mobile-first: their shifts, their derivation strips, the dispute
 * button inside the window with the honest countdown. No login.
 *
 * TODO: verifyStaffToken; shares with expandable DerivationStrip;
 * dispute form (window-gated, note required).
 */

export default async function StaffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <h1 className="t-h2">Your shifts</h1>
      <p className="t-secondary mt-4">Not implemented: shares, math, dispute window.</p>
    </main>
  );
}
