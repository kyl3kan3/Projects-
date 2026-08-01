"use client";

import { useActionState } from "react";
import type { Plan } from "@/db/schema";
import { checkoutAction, portalAction, type SettingsState } from "../actions";

export function BillingActions({
  plan,
  isCurrent,
  configured,
}: {
  plan: Plan;
  isCurrent: boolean;
  configured: boolean;
}) {
  const [checkoutState, checkout, checkingOut] = useActionState<SettingsState, FormData>(
    checkoutAction,
    {},
  );
  const [portalState, portal, opening] = useActionState<SettingsState, FormData>(portalAction, {});
  const error = checkoutState.error ?? portalState.error;

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <form action={checkout}>
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="interval" value="monthly" />
          <button
            className={isCurrent ? "btn btn-secondary" : "btn btn-primary"}
            type="submit"
            disabled={checkingOut || !configured}
          >
            {checkingOut ? "Opening Stripe…" : isCurrent ? "Change monthly" : "Choose monthly"}
          </button>
        </form>
        <form action={checkout}>
          <input type="hidden" name="plan" value={plan} />
          <input type="hidden" name="interval" value="annual" />
          <button className="btn btn-secondary" type="submit" disabled={checkingOut || !configured}>
            Annual
          </button>
        </form>
        {isCurrent ? (
          <form action={portal}>
            <button className="btn btn-secondary" type="submit" disabled={opening || !configured}>
              {opening ? "Opening…" : "Manage billing"}
            </button>
          </form>
        ) : null}
      </div>
      {error ? (
        <p className="t-secondary mt-3" style={{ color: "var(--color-ember)" }} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
