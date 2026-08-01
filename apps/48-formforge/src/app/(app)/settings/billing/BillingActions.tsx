"use client";

import { useState } from "react";
import type { Plan } from "@/db/schema";
import { openCheckoutAction, openPortalAction } from "./actions";

/**
 * Checkout and portal buttons. A client component so a Stripe error surfaces as a
 * sentence instead of an error page — a failed upgrade must not look like a broken
 * app, because the rest of the product still works.
 */
export function BillingActions({
  plan,
  portal,
  disabled,
}: {
  plan?: Plan;
  portal?: boolean;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setError(null);
    const result = portal ? await openPortalAction() : await openCheckoutAction(plan!);
    if (result.url) window.location.href = result.url;
    else setError(result.error ?? "Could not reach Stripe.");
    setBusy(false);
  }

  return (
    <div>
      <button
        className={portal ? "btn btn-secondary" : "btn btn-primary"}
        type="button"
        onClick={go}
        disabled={busy || disabled}
      >
        {busy ? "Opening…" : portal ? "Manage billing" : "Choose this plan"}
      </button>
      {error && (
        <p className="t-secondary mt-2" style={{ color: "var(--color-clay)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
