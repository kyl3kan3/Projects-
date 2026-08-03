"use client";

import { useActionState } from "react";
import { waiveFromLedgerAction, type WaiveValues } from "@/app/(app)/ledger/actions";
import { emptyState, type FormState } from "@/lib/forms";

const BLANK: FormState<WaiveValues> = emptyState({});

/**
 * The one-tap waive on a ledger row.
 *
 * Its own `<form>`, never nested inside another: an inner form is silently dropped by the
 * browser and its submit runs the outer action instead.
 */
export function WaiveButton({ chargeId }: { chargeId: string }) {
  const [state, action, pending] = useActionState(waiveFromLedgerAction, BLANK);
  return (
    <form action={action} style={{ display: "grid", gap: 4 }}>
      <input type="hidden" name="chargeId" value={chargeId} />
      <button className="btn-quiet" type="submit" disabled={pending} style={{ minHeight: 44 }}>
        {pending ? "Waiving…" : "Waive this fee"}
      </button>
      {state.error && (
        <span className="t-secondary" style={{ color: "var(--color-red)" }}>
          {state.error}
        </span>
      )}
      {state.notice && <span className="t-secondary">{state.notice}</span>}
    </form>
  );
}
