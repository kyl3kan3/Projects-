"use client";

import { useActionState } from "react";
import { openPortalAction, startCheckoutAction } from "./actions";
import { IDLE, type ActionState } from "@/lib/action-state";
import { IconCheck } from "@/components/icons";
import type { Plan } from "@/db/schema";

export function PlanPicker({
  currentPlan,
  activeEmployees,
  configured,
  hasCustomer,
  plans,
}: {
  currentPlan: Plan;
  activeEmployees: number;
  configured: boolean;
  hasCustomer: boolean;
  plans: {
    id: Plan;
    name: string;
    price: string;
    annual: string;
    headcount: number;
    tagline: string;
    includes: string[];
  }[];
}) {
  const [checkoutState, checkoutAction, checking] = useActionState<ActionState, FormData>(
    startCheckoutAction,
    IDLE,
  );
  const [portalState, portalAction, opening] = useActionState<ActionState, FormData>(
    () => openPortalAction(IDLE),
    IDLE,
  );

  return (
    <section className="mt-8">
      <h2 className="t-label">Plans</h2>
      <div className="mt-3 flex flex-col gap-4">
        {plans.map((plan) => {
          const fits = activeEmployees <= plan.headcount;
          const current = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className="panel p-5"
              style={{ borderLeft: current ? "2px solid var(--color-hardhat)" : undefined }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-title">{plan.name}</p>
                <p className="t-mono" style={{ fontSize: 18 }}>
                  {plan.price}
                  <span className="t-secondary">/mo</span>
                </p>
              </div>
              <p className="t-secondary mt-1">{plan.tagline}</p>
              <p className="t-data mt-2" style={{ color: "var(--color-fg-3)" }}>
                UP TO {plan.headcount} FIELD EMPLOYEES · {plan.annual}/YEAR (TWO MONTHS FREE)
              </p>
              <ul className="mt-3">
                {plan.includes.map((item) => (
                  <li key={item} className="t-secondary flex gap-2 py-1">
                    <IconCheck size={16} style={{ color: "var(--color-green)", flex: "none" }} />
                    {item}
                  </li>
                ))}
              </ul>
              {!fits ? (
                <p className="t-secondary mt-3" style={{ color: "var(--color-orange)" }}>
                  You have {activeEmployees} active field employees — more than this plan covers.
                </p>
              ) : null}
              <form action={checkoutAction} className="mt-4">
                <input type="hidden" name="plan" value={plan.id} />
                <button
                  className="btn btn-primary btn-full"
                  type="submit"
                  disabled={checking || (current && hasCustomer)}
                >
                  {current && hasCustomer
                    ? "Current plan"
                    : checking
                      ? "Opening Stripe…"
                      : `Choose ${plan.name}`}
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {checkoutState.error ? (
        <p className="t-secondary mt-4" role="alert" style={{ color: "var(--color-red)" }}>
          {checkoutState.error}
        </p>
      ) : null}

      {hasCustomer ? (
        <form action={portalAction} className="mt-6">
          <button className="btn btn-secondary btn-full" type="submit" disabled={opening}>
            {opening ? "Opening…" : "Manage payment and invoices"}
          </button>
          {portalState.error ? (
            <p className="t-secondary mt-3" role="alert" style={{ color: "var(--color-red)" }}>
              {portalState.error}
            </p>
          ) : null}
        </form>
      ) : null}

      {!configured ? (
        <p className="t-secondary mt-6">
          Stripe keys are not set on this deployment, so checkout will explain that rather than
          opening. Everything else in the product works — no compliance feature is gated behind
          billing.
        </p>
      ) : null}
    </section>
  );
}
