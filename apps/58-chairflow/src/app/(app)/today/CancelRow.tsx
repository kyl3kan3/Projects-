"use client";

import { useActionState } from "react";
import { cancelAppointmentAction, type SimpleState } from "@/app/(app)/today/actions";

const BLANK: SimpleState = { error: null, notice: null };

/**
 * Cancel an upcoming appointment from the stylist's side — the client who texts instead of
 * using their manage link.
 *
 * Its own top-level `<form>`, and a sibling of the row's link rather than a child of it: a
 * form inside an anchor is invalid, and a button inside one navigates instead of submitting.
 * Cancelling also offers the freed hour to the waitlist, which is why the notice says so.
 */
export function CancelRow({ appointmentId, label }: { appointmentId: string; label: string }) {
  const [state, action, pending] = useActionState(cancelAppointmentAction, BLANK);
  return (
    <form action={action} style={{ display: "grid", gap: 4, padding: "4px 0 12px" }}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <button
        className="btn-quiet"
        type="submit"
        disabled={pending}
        style={{ justifySelf: "start", color: "var(--color-ink-2)", minHeight: 44 }}
      >
        {pending ? "Cancelling…" : `Cancel ${label}`}
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
