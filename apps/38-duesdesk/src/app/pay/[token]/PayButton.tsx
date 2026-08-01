"use client";

import { useFormStatus } from "react-dom";
import { IconBank } from "@/components/icons";
import { formatMoney } from "@/lib/money";
import { payInvoiceAction } from "./actions";

/**
 * Pay once. The button leads to Stripe's hosted checkout with bank transfer
 * listed before card, because on $180 of quarterly dues that is the difference
 * between about $1.44 and about $5.52 of the association's money.
 */
export function PayButton({
  token,
  invoiceId,
  amountCents,
}: {
  token: string;
  invoiceId: string;
  amountCents: number;
}) {
  return (
    <form action={payInvoiceAction} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Submit amountCents={amountCents} />
      <p className="t-secondary flex items-center gap-2">
        <IconBank size={18} className="green" />
        Bank transfer is offered first and costs the association the least.
      </p>
    </form>
  );
}

function Submit({ amountCents }: { amountCents: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
      {pending ? "Opening checkout…" : `Pay ${formatMoney(amountCents)}`}
    </button>
  );
}
