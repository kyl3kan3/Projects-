/**
 * /q/[token] — the customer quote/sign page (DESIGN.md screen 4).
 *
 * A kraft-paper manifest: line items with quantities, terms, the
 * damage-fee schedule, deposit amount. Accept = signature + initials
 * on the damage clause (canvas), then the card field for the
 * authorization hold. No customer account, ever.
 *
 * TODO:
 * - [ ] verifySignToken -> order or a calm expired page.
 * - [ ] Acceptance transaction: assertAvailableTx re-check (conflict
 *       names the other order), signature capture, doc hash, hold
 *       creation (deposits.createHold), status -> confirmed.
 * - [ ] Already-signed state renders the receipt view.
 */

export default async function QuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="t-h2">Your rental quote</h1>
      <p className="t-secondary mt-4">Not implemented: lines, terms, sign, deposit hold.</p>
    </main>
  );
}
