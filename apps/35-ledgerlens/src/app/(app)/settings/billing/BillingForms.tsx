"use client";

import { useActionState } from "react";
import {
  openBillingPortalAction,
  startCheckoutAction,
  type BillingFormState,
} from "./actions";

const initial: BillingFormState = { error: null };

export function PlanPicker({
  plans,
  currentPlan,
  configured,
}: {
  plans: { id: string; name: string; price: string; cap: number; blurb: string }[];
  currentPlan: string;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, initial);

  return (
    <div className="mt-4">
      {state.error ? (
        <p className="t-secondary mb-4" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlan;
          return (
            <div key={p.id} className="panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-title">{p.name}</span>
                <span className="t-mono text-[17px]">{p.price}</span>
              </div>
              <p className="t-data mt-1" style={{ color: "var(--color-fg-3)" }}>
                up to {p.cap} documents a month
              </p>
              <p className="t-secondary mt-2">{p.blurb}</p>
              {isCurrent ? (
                <p className="t-data mt-3" style={{ color: "var(--color-ledger)" }}>
                  Your current plan
                </p>
              ) : (
                <form action={action} className="mt-3">
                  <input type="hidden" name="plan" value={p.id} />
                  <button
                    type="submit"
                    className="btn btn-primary btn-full"
                    disabled={pending || !configured}
                  >
                    {pending ? "Opening Stripe…" : `Switch to ${p.name}`}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BillingPortalButton({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(openBillingPortalAction, initial);
  return (
    <form action={action} className="mt-4">
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending || !configured}>
        {pending ? "Opening…" : "Manage payment, invoices and cancellation"}
      </button>
      {state.error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
