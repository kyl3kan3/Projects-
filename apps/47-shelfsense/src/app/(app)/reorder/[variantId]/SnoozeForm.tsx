"use client";

/**
 * Snooze, behind a 600ms hold — the secondary action in the thumb zone, next to the
 * primary "Add to PO draft".
 *
 * The hold drives a real form submit rather than calling the action directly, so the
 * keyboard path, the pointer path and the progressive-enhancement path are all one
 * code path.
 */

import { useActionState, useRef } from "react";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { snoozeAction, type ActionState } from "../actions";

const initial: ActionState = { error: null, note: null };

export function SnoozeForm({ variantId, days = 14 }: { variantId: string; days?: number }) {
  const [state, action] = useActionState(snoozeAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <input type="hidden" name="days" value={days} />
      <HoldToConfirm
        label={`Snooze ${days} days`}
        holdingLabel="Hold to snooze…"
        doneLabel="Snoozed"
        onConfirm={() => formRef.current?.requestSubmit()}
      />
      {state.note ? (
        <span className="t-data" style={{ color: "var(--color-fg-3)" }} role="status">
          {state.note}
        </span>
      ) : null}
      {state.error ? (
        <span className="t-data" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
