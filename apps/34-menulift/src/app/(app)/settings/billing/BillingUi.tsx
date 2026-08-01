"use client";

import { useActionState } from "react";
import {
  openPortalAction,
  startCheckoutAction,
} from "./actions";
import { EMPTY_BILLING } from "./state";
import { PLANS, PLAN_IDS, monthlyTotalCents, type PlanId } from "@/lib/plans";
import { money } from "@/lib/format";
import { IconCheck } from "@/components/icons";

export function PlanPicker({
  currentPlan,
  locationCount,
  configured,
}: {
  currentPlan: PlanId;
  locationCount: number;
  configured: boolean;
}) {
  const [state, action, pending] = useActionState(startCheckoutAction, EMPTY_BILLING);

  return (
    <form action={action} style={{ display: "grid", gap: 16 }}>
      {PLAN_IDS.map((id) => {
        const plan = PLANS[id];
        const total = monthlyTotalCents(id, locationCount);
        const current = id === currentPlan;
        return (
          <section
            key={id}
            className="card"
            style={{ padding: 16, display: "grid", gap: 8 }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <h3 className="t-dish" style={{ margin: 0, flex: 1 }}>
                {plan.name}
              </h3>
              <p className="t-data" style={{ margin: 0 }}>
                {money(plan.priceCents)}/location
              </p>
            </div>
            <p className="t-secondary" style={{ margin: 0 }}>
              {plan.tagline}
            </p>
            <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 6 }}>
              {plan.adds.map((line) => (
                <li key={line} className="t-secondary" style={{ display: "flex", gap: 8 }}>
                  <span style={{ color: "#5f7e4e", flex: "0 0 auto" }}>
                    <IconCheck size={16} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <p className="t-data" style={{ margin: "8px 0 0", color: "var(--fg-3)" }}>
              {locationCount === 1
                ? `${money(total)}/mo for this location`
                : `${money(total)}/mo for ${locationCount} locations (20% off past the first)`}
            </p>
            {current ? (
              <span className="pill pill-live" style={{ width: "fit-content" }}>
                <span className="pill-dot" />
                Current plan
              </span>
            ) : (
              <button
                className="btn btn-primary btn-block"
                type="submit"
                name="plan"
                value={id}
                disabled={pending || !configured}
              >
                {pending ? "Opening Stripe…" : `Switch to ${plan.name}`}
              </button>
            )}
          </section>
        );
      })}
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ margin: 0, color: "#c05a3e" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function PortalButton() {
  const [state, action, pending] = useActionState(openPortalAction, EMPTY_BILLING);
  return (
    <form action={action}>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Manage card and invoices"}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ marginTop: 8, color: "#c05a3e" }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
