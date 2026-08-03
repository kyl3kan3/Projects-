"use client";

import { useActionState, useState, useTransition } from "react";
import {
  openPortalAction,
  startCheckoutAction,
  type BillingState,
} from "./actions";

const initial: BillingState = {};

export function PlanButton({ plan, label }: { plan: string; label: string }) {
  const [state, action, pending] = useActionState(startCheckoutAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="plan" value={plan} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Opening…" : label}
      </button>
      {state.error && (
        <p className="field-error mt-2" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function PortalButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        className="btn btn-secondary btn-full"
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await openPortalAction();
            if (result.error) setError(result.error);
          })
        }
      >
        {pending ? "Opening…" : "Manage subscription"}
      </button>
      {error && (
        <p className="field-error mt-2" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
