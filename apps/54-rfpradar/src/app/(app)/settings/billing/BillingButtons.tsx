"use client";

/**
 * Checkout and portal buttons.
 *
 * The action returns a Stripe-hosted URL and the client follows it. Redirecting
 * from inside the action would work too, but returning the URL means a Stripe
 * misconfiguration shows up as a readable sentence on this page instead of a
 * redirect into a 500.
 */

import { useActionState, useEffect } from "react";
import type { BillingState } from "./actions";

const EMPTY: BillingState = { error: null, url: null };

export function BillingButton({
  action,
  plan,
  label,
  pendingLabel,
  variant = "primary",
}: {
  action: (state: BillingState, formData: FormData) => Promise<BillingState>;
  plan?: string;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  useEffect(() => {
    if (state.url) window.location.href = state.url;
  }, [state.url]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      {plan && <input type="hidden" name="plan" value={plan} />}
      <button className={`btn btn-${variant} w-full`} type="submit" disabled={pending}>
        {pending || state.url ? pendingLabel : label}
      </button>
      {state.error && (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
