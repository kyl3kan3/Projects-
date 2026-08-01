"use client";

/**
 * The sync control. DESIGN.md asks for pull-to-refresh *and* a header control,
 * because a gesture is never the only path — so this is the button, and it is the
 * same action the gesture calls.
 */

import { useActionState } from "react";
import { IconRefresh } from "@/components/icons";
import { resyncAction, type ActionState } from "./actions";

const initial: ActionState = { error: null, note: null };

export function ResyncButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState(resyncAction, initial);

  return (
    <form action={action} className="flex flex-col items-end">
      <button
        type="submit"
        className="btn-quiet flex items-center gap-1.5"
        disabled={pending}
        style={{ minHeight: 44 }}
      >
        <IconRefresh size={16} />
        <span className="t-data">{pending ? "SYNCING…" : label}</span>
      </button>
      {state.note ? (
        <span className="t-data mt-1" style={{ color: "var(--color-fg-3)" }} role="status">
          {state.note}
        </span>
      ) : null}
      {state.error ? (
        <span className="t-data mt-1" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
