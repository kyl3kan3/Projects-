"use client";

import { useActionState, useState } from "react";
import { openPortal, startCheckout, type BillingState } from "./actions";
import { IconCheck } from "@/components/icons";
import type { Plan } from "@/db/schema";

export interface PlanCard {
  id: Plan;
  name: string;
  monthly: string;
  annualMonthly: string;
  annualTotal: string;
  blurb: string;
  features: string[];
  current: boolean;
}

export function PlanChooser({
  plans,
  stripeReady,
  currentIsPaid,
}: {
  plans: PlanCard[];
  stripeReady: boolean;
  currentIsPaid: boolean;
}) {
  const [state, action, pending] = useActionState<BillingState, FormData>(startCheckout, {});
  const [portalState, portalAction, portalPending] = useActionState<BillingState, FormData>(
    openPortal,
    {},
  );
  const [interval, setInterval] = useState<"month" | "year">("year");

  return (
    <>
      <div className="chip-row mt-4">
        {(["year", "month"] as const).map((i) => (
          <button
            key={i}
            type="button"
            className="chip"
            data-active={interval === i}
            onClick={() => setInterval(i)}
          >
            {i === "year" ? "Annual — 2 months free" : "Monthly"}
          </button>
        ))}
      </div>

      {(state.error || portalState.error) && (
        <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error ?? portalState.error}
        </p>
      )}

      {!stripeReady && (
        <p className="t-secondary mt-4" style={{ maxWidth: "52ch", color: "var(--color-amber-text)" }}>
          Stripe is not configured on this deployment, so checkout is unavailable here. The
          prices and limits below are the real ones.
        </p>
      )}

      <div className="mt-6 flex flex-col gap-6 lg:flex-row">
        {plans.map((p) => (
          <section key={p.id} className="panel flex-1 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="t-label">{p.name}</p>
              {p.current && (
                <span className="t-data" style={{ color: "var(--color-accent-text)" }}>
                  CURRENT
                </span>
              )}
            </div>

            <p className="t-mono mt-3" style={{ fontSize: 28, fontWeight: 500 }}>
              {interval === "year" ? p.annualMonthly : p.monthly}
              <span className="t-secondary" style={{ fontSize: 13 }}> /mo</span>
            </p>
            {interval === "year" && (
              <p className="t-data mt-1" style={{ color: "var(--color-fg-2)" }}>
                {p.annualTotal} BILLED ANNUALLY
              </p>
            )}

            <p className="t-secondary mt-3" style={{ maxWidth: "38ch" }}>
              {p.blurb}
            </p>

            <ul className="mt-4">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 py-1">
                  <span className="mark-accepted" style={{ marginTop: 2 }}>
                    <IconCheck size={16} />
                  </span>
                  <span className="t-body">{f}</span>
                </li>
              ))}
            </ul>

            <form action={action} className="mt-5">
              <input type="hidden" name="plan" value={p.id} />
              <input type="hidden" name="interval" value={interval} />
              <button
                type="submit"
                className={`btn btn-full ${p.id === "standard" ? "btn-primary" : "btn-secondary"}`}
                disabled={pending || !stripeReady || p.current}
              >
                {p.current ? "Your plan" : pending ? "Opening checkout…" : `Choose ${p.name}`}
              </button>
            </form>
          </section>
        ))}
      </div>

      {currentIsPaid && (
        <form action={portalAction} className="mt-6">
          <button type="submit" className="btn-quiet" disabled={portalPending || !stripeReady}>
            {portalPending ? "Opening…" : "Manage payment method and invoices"}
          </button>
        </form>
      )}
    </>
  );
}
