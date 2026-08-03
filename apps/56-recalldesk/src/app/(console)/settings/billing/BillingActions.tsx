"use client";

import { useActionState } from "react";
import type { BillingState } from "./actions";

type Action = (state: BillingState, formData: FormData) => Promise<BillingState>;

export function CheckoutButton({
  action,
  plan,
  label,
  primary,
  disabled,
}: {
  action: Action;
  plan: string;
  label: string;
  primary?: boolean;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction}>
      <input type="hidden" name="plan" value={plan} />
      <button
        className={primary ? "btn btn-primary" : "btn btn-secondary"}
        type="submit"
        disabled={pending || disabled}
        style={{ width: "100%" }}
      >
        {pending ? "Opening Stripe…" : label}
      </button>
      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", marginTop: 8, marginBottom: 0 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PortalButton({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction}>
      <button className="btn btn-secondary" type="submit" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Opening…" : "Manage subscription"}
      </button>
      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", marginTop: 8, marginBottom: 0 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
