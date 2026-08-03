"use client";

import { useActionState } from "react";
import {
  openPortalAction,
  startCheckoutAction,
  type BillingValues,
} from "@/app/(app)/settings/billing/actions";
import { emptyState, type FormState } from "@/lib/forms";

const BLANK: FormState<BillingValues> = emptyState({});

export function PlanButton({
  plan,
  label,
  current,
}: {
  plan: string;
  label: string;
  current: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <input type="hidden" name="plan" value={plan} />
      <button
        className={`btn ${current ? "btn-secondary" : "btn-primary"} btn-full`}
        type="submit"
        disabled={pending}
      >
        {pending ? "Opening Stripe…" : label}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

export function PortalButton() {
  const [state, action, pending] = useActionState(openPortalAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 4 }}>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Manage payment and cancel"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
