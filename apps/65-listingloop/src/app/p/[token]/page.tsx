/**
 * /p/[token] — the party portal (DESIGN.md screen 5).
 *
 * Read view for clients: done / next / needed-from-you with inline
 * upload; the deal line in miniature. Mobile-first, plain language,
 * no login.
 *
 * TODO: verifyPartyToken -> party + deal (calm expired page
 * otherwise); presigned upload for requested docs; the miniature
 * DealLine read-only.
 */

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="t-h2">Your transaction</h1>
      <p className="t-secondary mt-4">Not implemented: done / next / needed-from-you.</p>
    </main>
  );
}
