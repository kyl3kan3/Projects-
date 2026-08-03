"use client";

import { useState, useTransition } from "react";
import { IconAlert, IconCard, IconCheck } from "@/components/icons";
import {
  connectStripeAction,
  openBillingPortalAction,
  startPlanCheckoutAction,
  type BillingState,
} from "./actions";
import type { Plan } from "@/db/schema";

export interface PlanCard {
  id: Plan;
  name: string;
  price: string;
  blurb: string;
  bullets: string[];
  current: boolean;
}

export function BillingControls({
  plans,
  hasSubscription,
  connectLabel,
}: {
  plans: PlanCard[];
  hasSubscription: boolean;
  connectLabel: string;
}) {
  const [state, setState] = useState<BillingState>({});
  const [pending, startTransition] = useTransition();

  const go = (action: () => Promise<BillingState>) => {
    setState({});
    startTransition(async () => {
      const result = await action();
      setState(result);
      if (result.url) window.location.href = result.url;
    });
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {plans.map((card) => (
        <div key={card.id} className="panel" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <p className="t-title">{card.name}</p>
            <p className="t-data" style={{ fontSize: 16 }}>
              {card.price}
            </p>
          </div>
          <p className="t-secondary" style={{ marginTop: 8 }}>
            {card.blurb}
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "grid", gap: 6 }}>
            {card.bullets.map((bullet) => (
              <li key={bullet} className="t-secondary" style={{ display: "flex", gap: 8 }}>
                <IconCheck size={16} style={{ color: "var(--color-hi-vis)", flex: "none" }} />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <button
            className={card.current ? "btn btn-secondary btn-full" : "btn btn-primary btn-full"}
            type="button"
            style={{ marginTop: 16 }}
            disabled={pending || card.current}
            onClick={() => go(() => startPlanCheckoutAction(card.id))}
          >
            {card.current ? "Your plan" : `Choose ${card.name}`}
          </button>
        </div>
      ))}

      <div>
        <p className="t-label" style={{ paddingBottom: 8 }}>
          Deposits
        </p>
        <p className="t-secondary" style={{ paddingBottom: 12 }}>
          Deposits are collected on your own Stripe account. QuoteFox takes no percentage — you pay
          Stripe's processing fee and nothing to us.
        </p>
        <button
          className="btn btn-secondary btn-full"
          type="button"
          disabled={pending}
          onClick={() => go(connectStripeAction)}
        >
          <IconCard size={18} />
          {connectLabel}
        </button>
      </div>

      {hasSubscription ? (
        <button
          className="btn btn-secondary btn-full"
          type="button"
          disabled={pending}
          onClick={() => go(openBillingPortalAction)}
        >
          Manage the subscription
        </button>
      ) : null}

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} style={{ flex: "none" }} />
          <span>{state.error}</span>
        </p>
      ) : null}
    </div>
  );
}
