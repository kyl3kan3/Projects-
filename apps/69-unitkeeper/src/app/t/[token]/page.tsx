/**
 * /t/[token] — the tenant link (DESIGN.md screen 4).
 *
 * Purpose-scoped: move-in (lease read + sign + payment setup), pay
 * (balance + payment), receipt views. Mobile-first, plain language,
 * no account.
 *
 * TODO: verifyTenantToken -> purpose routing; signature canvas +
 * hash; Stripe Elements on the owner's Connect account.
 */

export default async function TenantPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  void (await params);
  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <h1 className="t-h2">Your unit</h1>
      <p className="t-secondary mt-4">Not implemented: lease, signature, payment.</p>
    </main>
  );
}
