"use client";

import { useActionState } from "react";
import { changePlanAction } from "../actions";
import { emptySettingsState } from "../SettingsForms";

export function PlanPicker({
  plan,
  planName,
  priceLabel,
  current,
  disabledReason,
}: {
  plan: string;
  planName: string;
  priceLabel: string;
  current: boolean;
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState(changePlanAction, emptySettingsState);

  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="plan" value={plan} />
      <button
        type="submit"
        className={`btn btn-full ${current ? "btn-secondary" : "btn-primary"}`}
        disabled={pending || current || disabledReason !== null}
      >
        {current
          ? `Current plan · ${priceLabel}`
          : pending
            ? "Opening Shopify…"
            : `Switch to ${planName} · ${priceLabel}`}
      </button>
      {disabledReason ? <p className="t-secondary mt-2">{disabledReason}</p> : null}
      {state.error ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
