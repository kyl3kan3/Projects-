"use client";

import { useActionState } from "react";
import {
  openPortalAction,
  setPlanWithoutStripeAction,
  startCheckoutAction,
  type BillingState,
} from "./actions";
import type { Plan } from "@/db/schema";

const initial: BillingState = { error: null };

export function ChoosePlanButton({
  plan,
  label,
  stripeReady,
  current,
}: {
  plan: Plan;
  label: string;
  stripeReady: boolean;
  current: boolean;
}) {
  const [state, action, pending] = useActionState(
    stripeReady ? startCheckoutAction : setPlanWithoutStripeAction,
    initial,
  );
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="plan" value={plan} />
      <button
        className={current ? "btn btn-secondary btn-full" : "btn btn-primary btn-full"}
        type="submit"
        disabled={pending || current}
      >
        {current ? "Current plan" : pending ? "Opening…" : label}
      </button>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ManageBillingButton() {
  const [state, action, pending] = useActionState(openPortalAction, initial);
  return (
    <form action={action}>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Opening Stripe…" : "Manage billing in Stripe"}
      </button>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
