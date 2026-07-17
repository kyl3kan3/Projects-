/**
 * /v/[token] — the vendor upload portal (DESIGN.md screen 6).
 *
 * One job: drop the ACORD PDF. Mobile-first (agents' assistants upload
 * from phones). States: received -> parsing -> under review / the
 * deficiency sentence when evaluation fails. Plain language, no
 * account.
 *
 * TODO:
 * - [ ] Verify upload token -> vendor + org (branded header: "Uploading
 *       to {org name}").
 * - [ ] Direct-to-R2 presigned PUT; certificates row; enqueue parse.
 * - [ ] Status polling section showing the pipeline honestly.
 */

export default async function VendorUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="t-h2">Upload your certificate</h1>
      <p className="t-secondary mt-4">Not implemented: drop zone, status pipeline.</p>
    </main>
  );
}
