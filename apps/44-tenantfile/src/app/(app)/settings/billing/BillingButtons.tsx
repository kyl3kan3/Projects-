"use client";

import { useActionState } from "react";
import { portalAction, upgradeAction, type FormState } from "@/app/(app)/actions";
import type { Plan } from "@/db/schema";

export function BillingButtons({
  plan,
  portal,
  label,
  disabled,
}: {
  plan?: Plan;
  portal?: boolean;
  label: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    portal ? async () => portalAction() : upgradeAction,
    {} as FormState,
  );

  return (
    <form action={formAction} className="mt-4">
      {plan ? <input type="hidden" name="plan" value={plan} /> : null}
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending || disabled}>
        {pending ? "Opening Stripe…" : label}
      </button>
      {state.error ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
