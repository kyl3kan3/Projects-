"use client";

import { useActionState } from "react";
import { IconAlert } from "@/components/icons";
import { checkoutAction, portalAction, type BillingState } from "./actions";

export function ChoosePlanButton({
  plan,
  label,
  current,
  disabled,
}: {
  plan: string;
  label: string;
  current: boolean;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(checkoutAction, {});
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="plan" value={plan} />
      <button
        className={`btn btn-full ${current ? "btn-secondary" : "btn-primary"}`}
        type="submit"
        disabled={pending || disabled || current}
      >
        {current ? "Current plan" : pending ? "Opening Stripe…" : label}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)", display: "flex", gap: 8 }}>
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}
    </form>
  );
}

export function PortalButton() {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(
    async () => portalAction({}),
    {},
  );
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Manage card and invoices"}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)", display: "flex", gap: 8 }}>
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}
    </form>
  );
}
