"use client";

import { useActionState } from "react";
import { openPortalAction, startCheckoutAction, type BillingState } from "./actions";

const INITIAL: BillingState = { error: null };

export function SubscribeButton({
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
  const [state, action, pending] = useActionState(startCheckoutAction, INITIAL);
  return (
    <form action={action}>
      <input type="hidden" name="plan" value={plan} />
      <button
        type="submit"
        className={current ? "btn btn-secondary btn-full" : "btn btn-primary btn-full"}
        disabled={pending || current || disabled}
      >
        {current ? "Current plan" : pending ? "Opening checkout…" : label}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PortalButton() {
  const [state, action, pending] = useActionState(openPortalAction, INITIAL);
  return (
    <form action={action} style={{ marginTop: 16 }}>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
