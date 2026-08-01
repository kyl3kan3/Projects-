"use client";

import { useActionState, useState } from "react";
import { openPortalAction, startCheckoutAction, type SettingsState } from "../actions";
import { PLANS, PLAN_ORDER, annualSavingLabel, priceLabel } from "@/lib/plans";
import { IconCheck } from "@/components/icons";
import type { Plan } from "@/db/schema";

const INITIAL: SettingsState = { error: null };

export function PlanPicker({ currentPlan }: { currentPlan: Plan }) {
  const [interval, setInterval] = useState<"monthly" | "annual">("monthly");
  const [state, formAction, pending] = useActionState(startCheckoutAction, INITIAL);

  return (
    <div>
      <div className="flex gap-2 pb-4">
        <button
          type="button"
          className="chip"
          data-active={interval === "monthly"}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </button>
        <button
          type="button"
          className="chip"
          data-active={interval === "annual"}
          onClick={() => setInterval("annual")}
        >
          Annual — 2 months free
        </button>
      </div>

      {state.error ? (
        <p
          className="t-secondary rule-b pb-3"
          role="alert"
          style={{ color: "var(--color-brick-text)" }}
        >
          {state.error}
        </p>
      ) : null}

      <div className="md:grid md:grid-cols-3 md:gap-4">
        {PLAN_ORDER.map((id) => {
          const spec = PLANS[id];
          const current = id === currentPlan;
          return (
            <article key={id} className="card mt-4 p-4 md:mt-0">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="t-title">{spec.name}</h3>
                <span className="t-data-lg">{priceLabel(id, interval)}</span>
              </div>
              <p className="t-secondary mt-1">{spec.blurb}</p>
              {interval === "annual" ? (
                <p className="t-label mt-1" style={{ color: "var(--color-gold-text)" }}>
                  {annualSavingLabel(id)}
                </p>
              ) : null}
              <ul className="mt-3 flex flex-col gap-2" style={{ listStyle: "none", padding: 0 }}>
                {spec.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span style={{ color: "var(--color-leaf-text)", lineHeight: 0, marginTop: 4 }}>
                      <IconCheck size={16} />
                    </span>
                    <span className="t-secondary">{feature}</span>
                  </li>
                ))}
              </ul>
              <form action={formAction} className="mt-4">
                <input type="hidden" name="plan" value={id} />
                <input type="hidden" name="interval" value={interval} />
                <button
                  className={current ? "btn btn-secondary w-full" : "btn btn-primary w-full"}
                  type="submit"
                  disabled={pending}
                >
                  {current ? "Current plan — change interval" : `Choose ${spec.name}`}
                </button>
              </form>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function PortalButton() {
  const [state, formAction, pending] = useActionState(openPortalAction, INITIAL);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-brick-text)" }}>
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-secondary w-full lg:w-auto" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </button>
    </form>
  );
}
