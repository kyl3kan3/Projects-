"use client";

import { useActionState, useState } from "react";
import { voidSignOffAction } from "../actions";
import { IDLE, type ActionState } from "@/lib/action-state";

/**
 * Voiding a signature. Two deliberate frictions: it takes a written reason, and
 * the copy says outright that nothing is deleted. A record you can quietly edit
 * is not a record, and this is the screen where that promise is either kept or
 * broken.
 */
export function VoidSignature({
  signOffId,
  instanceId,
  name,
}: {
  signOffId: string;
  instanceId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    voidSignOffAction,
    IDLE,
  );

  if (state.message) {
    return (
      <p className="t-secondary msg msg-ok w-full" role="status">
        {state.message}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-quiet"
        style={{ minHeight: 44, color: "var(--color-fg-3)" }}
        onClick={() => setOpen(true)}
      >
        Add a correction
      </button>
    );
  }

  return (
    <form action={action} className="w-full">
      <input type="hidden" name="signOffId" value={signOffId} />
      <input type="hidden" name="instanceId" value={instanceId} />
      <label className="t-label" htmlFor={`reason-${signOffId}`}>
        Why is {name}&apos;s signature being corrected?
      </label>
      <input
        id={`reason-${signOffId}`}
        name="reason"
        className="input mt-2"
        placeholder="Signed on the wrong name — corrected at the yard"
        required
        minLength={4}
      />
      <p className="t-secondary mt-2">
        The signature stays on the record. This appends your note beside it, with your name
        and the time.
      </p>
      <div className="mt-3 flex gap-3">
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record correction"}
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.error ? (
        <p className="t-secondary msg msg-error mt-2" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
