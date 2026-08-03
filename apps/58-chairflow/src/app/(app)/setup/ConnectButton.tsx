"use client";

import { useActionState } from "react";
import { connectStripeAction, type ConnectValues } from "@/app/(app)/setup/actions";
import { emptyState, type FormState } from "@/lib/forms";

const BLANK: FormState<ConnectValues> = emptyState({});

export function ConnectButton({ connected }: { connected: boolean }) {
  const [state, action, pending] = useActionState(connectStripeAction, BLANK);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <button
        className={`btn ${connected ? "btn-secondary" : "btn-primary"}`}
        type="submit"
        disabled={pending}
      >
        {pending ? "Opening Stripe…" : connected ? "Re-check Stripe" : "Connect Stripe"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && (
        <span className="t-secondary" style={{ color: "var(--color-amber-text)" }}>
          {state.notice}
        </span>
      )}
    </form>
  );
}
