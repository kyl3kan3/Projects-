import { cardFeeCents } from "@/lib/stripe";
import { formatMoney } from "@/lib/money";

/**
 * How the tenant pays.
 *
 * When the landlord has connected a Stripe account, this is where "Pay by bank"
 * lives. When they have not — which is the common case, and the case in this
 * deployment, since no Stripe keys exist here — the panel says so plainly instead
 * of showing a button that cannot work. The ledger is not diminished by that: it
 * records a Zelle transfer exactly as faithfully as an ACH one, which is the whole
 * argument in README's "payments gravity" risk.
 */
export function PayPanel({
  landlordName,
  amountDueCents,
  cardPassthrough,
  canPayOnline,
}: {
  token: string;
  landlordName: string;
  amountDueCents: number;
  cardPassthrough: boolean;
  canPayOnline: boolean;
}) {
  if (amountDueCents <= 0) {
    return (
      <section className="mb-8">
        <div className="notice" data-tone="good">
          <p className="t-secondary">Nothing to pay right now.</p>
        </div>
      </section>
    );
  }

  if (!canPayOnline) {
    return (
      <section className="mb-8">
        <div className="notice">
          <p className="t-title">Pay {landlordName} however you normally do</p>
          <p className="t-secondary mt-2">
            {landlordName} has not turned on card or bank payments here, so send the {formatMoney(amountDueCents)} the way
            you already agreed — Zelle, a check, a transfer. They record it on this page when it arrives, usually within a
            day, and you will see it in the list below.
          </p>
        </div>
      </section>
    );
  }

  const fee = cardFeeCents(amountDueCents);

  return (
    <section className="mb-8 flex flex-col gap-3">
      <button type="button" className="btn btn-primary btn-full" disabled>
        Pay {formatMoney(amountDueCents)} by bank
      </button>
      <p className="t-secondary">
        Bank payments take two to three working days to clear. It counts as paid on the day you send it — the balance above
        shows it as on its way until it lands.
      </p>
      <button type="button" className="btn btn-secondary btn-full" disabled>
        Pay by card instead
      </button>
      <p className="t-secondary">
        {cardPassthrough
          ? `Card costs an extra ${formatMoney(fee)} on ${formatMoney(amountDueCents)}, which is what the card company charges. Bank transfer is free.`
          : `${landlordName} covers the card fee.`}
      </p>
    </section>
  );
}
