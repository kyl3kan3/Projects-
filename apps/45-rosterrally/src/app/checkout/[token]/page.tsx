import type { Metadata } from "next";
import { ConfirmForm } from "./ConfirmForm";
import { confirmTestCheckoutAction } from "./actions";
import { formatMoney } from "@/lib/money";
import { verifyTestCheckout, gatewayIsLive } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Test checkout",
  robots: { index: false, follow: false },
};

/**
 * The test gateway's confirm screen, used only when no `STRIPE_SECRET_KEY` is set.
 *
 * It is labelled as a demo in the strongest terms the page can manage, because a
 * screen that takes an amount and says "pay" must never be mistakable for one that
 * charges a card. Confirming here calls the same `settlePayment` the Stripe webhook
 * calls, which is the point: the cascade, the receipts and the waitlist logic are
 * all exercised by the same code either way.
 */
export default async function TestCheckoutPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = await verifyTestCheckout(token);

  if (gatewayIsLive()) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <h1 className="t-h2">Not available</h1>
          <p className="t-body mt-3">
            This deployment has Stripe configured, so payments go through Stripe Checkout. The test
            gateway is switched off.
          </p>
        </div>
      </main>
    );
  }

  if (!claims) {
    return (
      <main className="world-day screen-narrow min-h-dvh">
        <div className="pt-12">
          <h1 className="t-h2">That checkout link has expired</h1>
          <p className="t-body mt-3">
            Nothing was charged. Start the registration again — your details are already saved, so it
            will be quick.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="world-day screen-narrow min-h-dvh">
      <div className="pt-12">
        <p className="t-label" style={{ color: "var(--bad)" }}>
          Demo gateway — no card is charged
        </p>
        <h1 className="t-h2 mt-2">Confirm {formatMoney(claims.amountCents)}</h1>
        <p className="t-body mt-3">
          This deployment has no Stripe key, so RosterRally is standing in for the card sheet. Press
          confirm and the registration settles exactly as it would after a real payment: the money is
          applied to this family&apos;s oldest open registration first, and their family page link is
          emailed.
        </p>
        <div className="panel mt-6 p-4">
          <div className="flex items-baseline justify-between">
            <span className="t-label">Amount</span>
            <span className="t-data-lg">{formatMoney(claims.amountCents)}</span>
          </div>
          {claims.platformFeeCents > 0 ? (
            <div className="mt-2 flex items-baseline justify-between">
              <span className="t-secondary">Of which RosterRally&apos;s fee</span>
              <span className="t-data">{formatMoney(claims.platformFeeCents)}</span>
            </div>
          ) : null}
          <div className="mt-2 flex items-baseline justify-between">
            <span className="t-secondary">Registrations covered</span>
            <span className="t-data">{claims.registrationIds.length}</span>
          </div>
        </div>
        <div className="mt-6">
          <ConfirmForm action={confirmTestCheckoutAction} token={token} />
        </div>
      </div>
    </main>
  );
}
