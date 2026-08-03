"use client";

import { useActionState } from "react";
import { IconCheck, IconX } from "@/components/icons";
import { dismissAction, markDoneAction, type WasteState } from "./actions";

/**
 * The `check` action DESIGN.md puts on each waste row, plus a quiet dismiss. Both
 * are forms, so they work without JavaScript and the total above them rolls down
 * on the next render.
 */
export function WasteRowActions({ findingId, title }: { findingId: string; title: string }) {
  const [doneState, doneAction, donePending] = useActionState<WasteState, FormData>(
    markDoneAction,
    {},
  );
  const [dismissState, dismiss, dismissPending] = useActionState<WasteState, FormData>(
    dismissAction,
    {},
  );
  const error = doneState.error ?? dismissState.error;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
      {error ? (
        <span className="t-secondary" role="alert" style={{ color: "var(--color-amber)" }}>
          {error}
        </span>
      ) : null}
      <form action={dismiss}>
        <input type="hidden" name="findingId" value={findingId} />
        <button
          type="submit"
          aria-label={`Dismiss: ${title}`}
          disabled={dismissPending}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            background: "none",
            border: 0,
            color: "var(--color-text-3)",
          }}
        >
          <IconX size={18} />
        </button>
      </form>
      <form action={doneAction}>
        <input type="hidden" name="findingId" value={findingId} />
        <button
          type="submit"
          aria-label={`Mark done: ${title}`}
          disabled={donePending}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            background: "none",
            border: 0,
            color: "var(--color-green)",
          }}
        >
          <IconCheck size={20} />
        </button>
      </form>
    </div>
  );
}
