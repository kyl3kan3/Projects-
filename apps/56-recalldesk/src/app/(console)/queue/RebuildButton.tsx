"use client";

import { useActionState } from "react";
import type { QueueState } from "./actions";

/** The visible equivalent of pull-to-refresh: re-rank today's queue now. */
export function RebuildButton({
  action,
}: {
  action: (state: QueueState, formData: FormData) => Promise<QueueState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction}>
      <button className="btn-quiet" type="submit" disabled={pending}>
        {pending ? "Rebuilding…" : "Rebuild"}
      </button>
      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", margin: 0 }}>
          {state.error}
        </p>
      )}
    </form>
  );
}
