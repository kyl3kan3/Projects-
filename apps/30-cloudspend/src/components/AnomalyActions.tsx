"use client";

import { useActionState } from "react";
import { IconCheck } from "@/components/icons";
import { ackAction, resolveAction, type ActionState } from "@/app/(app)/anomalies/actions";

/**
 * Ack and Resolve. Both are plain forms, so they work before hydration and the
 * pending state comes from React rather than a hand-rolled flag.
 *
 * DESIGN.md: Ack is the full-width primary in the thumb zone; Resolve is the
 * secondary. Neither is styled as destructive — a cost anomaly is information.
 */

export function AckButton({ anomalyId, label = "Ack" }: { anomalyId: string; label?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(ackAction, {});
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="anomalyId" value={anomalyId} />
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        <IconCheck size={18} />
        {pending ? "Acking…" : label}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ResolveButton({ anomalyId }: { anomalyId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(resolveAction, {});
  return (
    <form action={formAction} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="anomalyId" value={anomalyId} />
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Resolving…" : "Resolve"}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
