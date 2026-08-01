"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/money";
import { IconBanknote } from "@/components/icons";
import type { PublicState } from "./actions";

/**
 * The client's pay button. It asks the server for a Checkout URL and then sends
 * them there, so a Stripe outage shows up as a sentence on this page with the
 * freelancer's email beside it, not as a broken redirect.
 */
export function PayPanel({
  token,
  balance,
  currency,
  acceptsAch,
  freelancerEmail,
  start,
}: {
  token: string;
  balance: number;
  currency: string;
  acceptsAch: boolean;
  freelancerEmail: string;
  start: (token: string) => Promise<PublicState>;
}) {
  const [state, setState] = useState<PublicState>({});
  const [pending, startTransition] = useTransition();

  return (
    <section>
      <button
        className="btn btn-primary btn-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await start(token);
            setState(result);
            if (result.paymentUrl) window.location.href = result.paymentUrl;
          })
        }
      >
        <IconBanknote size={18} />
        {pending ? "Opening secure checkout…" : `Pay ${formatMoney(balance, currency)}`}
      </button>
      <p className="t-secondary mt-3">
        {acceptsAch
          ? "Card or US bank transfer (ACH), handled by Stripe. Nothing card-related touches this page."
          : "Card payment handled by Stripe. Nothing card-related touches this page."}
      </p>
      {state.error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-vermilion)" }} role="alert">
          {state.error} You can reply to {freelancerEmail} to arrange payment another way.
        </p>
      ) : null}
    </section>
  );
}
