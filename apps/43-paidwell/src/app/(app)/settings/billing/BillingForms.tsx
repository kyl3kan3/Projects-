"use client";

import { useActionState } from "react";
import { IconAlert, IconCheck } from "@/components/icons";
import { PLAN_ORDER, PLANS } from "@/lib/plans";
import type { Plan } from "@/db/schema";
import {
  connectStripeAction,
  openBillingPortalAction,
  startCheckoutAction,
  type BillingState,
} from "./actions";

function Feedback({ state }: { state: BillingState }) {
  if (!state.error && !state.notice) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{
        color: state.error ? "var(--color-red)" : "var(--color-banker)",
        display: "flex",
        gap: 8,
        marginTop: 8,
      }}
    >
      {state.error ? <IconAlert size={18} style={{ flex: "none" }} /> : <IconCheck size={18} style={{ flex: "none" }} />}
      <span>{state.error ?? state.notice}</span>
    </p>
  );
}

export function PlanPicker({ current }: { current: Plan }) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(startCheckoutAction, {});
  return (
    <div>
      <div style={{ display: "grid", gap: 16 }}>
        {PLAN_ORDER.map((id) => {
          const features = PLANS[id];
          const isCurrent = id === current;
          return (
            <article key={id} className="panel" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <p className="t-title">
                  {features.name}
                  {isCurrent ? (
                    <span className="t-label" style={{ marginLeft: 8, color: "var(--color-banker)" }}>
                      current
                    </span>
                  ) : null}
                </p>
                <p className="t-data" style={{ fontSize: 15 }}>
                  ${(features.priceCents / 100).toFixed(0)}/mo
                </p>
              </div>
              <p className="t-secondary" style={{ marginTop: 8 }}>
                {features.blurb}
              </p>
              <p className="t-data" style={{ marginTop: 8, color: "var(--color-text-aa)" }}>
                {features.openInvoiceLimit === Number.MAX_SAFE_INTEGER
                  ? "unlimited invoices"
                  : `${features.openInvoiceLimit} open invoices`}{" "}
                · {features.seats} {features.seats === 1 ? "seat" : "seats"}
                {features.managedFirms > 1 ? ` · ${features.managedFirms} firms` : ""}
              </p>
              {!isCurrent ? (
                <form action={formAction} style={{ marginTop: 12 }}>
                  <input type="hidden" name="plan" value={id} />
                  <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
                    {pending ? "Opening Stripe…" : `Switch to ${features.name}`}
                  </button>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
      <Feedback state={state} />
    </div>
  );
}

export function ManageSubscriptionButton() {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(
    openBillingPortalAction,
    {},
  );
  return (
    <form action={formAction}>
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Manage your subscription"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ConnectStripeButton({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState<BillingState, FormData>(connectStripeAction, {});
  return (
    <form action={formAction}>
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Opening Stripe…" : connected ? "Update your Stripe account" : "Connect your Stripe account"}
      </button>
      <p className="t-secondary" style={{ marginTop: 8 }}>
        Portal payments land in your own Stripe account. PaidWell never holds your money and
        never takes a percentage of it.
      </p>
      <Feedback state={state} />
    </form>
  );
}
