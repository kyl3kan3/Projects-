"use client";

import { useActionState } from "react";
import { portalAction, upgradeAction, type BillingState } from "./actions";
import type { PlanId } from "@/db/schema";

export function UpgradeButton({
  planId,
  label,
  disabled,
}: {
  planId: Exclude<PlanId, "free">;
  label: string;
  disabled?: boolean;
}) {
  const action = upgradeAction.bind(null, planId);
  const [state, formAction, pending] = useActionState<BillingState, FormData>(
    async (prev) => action(prev),
    {},
  );
  return (
    <form action={formAction}>
      <button type="submit" className="btn btn-primary btn-full" disabled={pending || disabled}>
        {pending ? "Opening Stripe…" : label}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ marginTop: 8, color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function PortalButton() {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(
    async (prev) => portalAction(prev),
    {},
  );
  return (
    <form action={formAction}>
      <button type="submit" className="btn btn-secondary btn-full" disabled={pending}>
        {pending ? "Opening Stripe…" : "Manage payment and invoices"}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ marginTop: 8, color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
