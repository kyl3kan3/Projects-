"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { phoneDisplay, phoneHref } from "@/lib/format";
import type { QueueState } from "./actions";

/**
 * A booking request that came in from a tokenised link, pinned above the queue
 * with the `link-token` glyph (DESIGN.md). The front desk calls back, books it in
 * their PMS, and confirms here with the date — one tap plus a date.
 */
export function RequestCard({
  request,
  confirm,
  dismiss,
}: {
  request: {
    id: string;
    patientId: string;
    patientName: string;
    phone: string | null;
    windows: string[];
    note: string | null;
    askedOn: string;
  };
  confirm: (state: QueueState, formData: FormData) => Promise<QueueState>;
  dismiss: (state: QueueState, formData: FormData) => Promise<QueueState>;
}) {
  const [confirmState, confirmAction, confirming] = useActionState(confirm, { error: null });
  const [, dismissAction, dismissing] = useActionState(dismiss, { error: null });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card" style={{ padding: 16, marginBottom: 12 }}>
      <p className="t-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6, color: "var(--color-aqua-text)" }}>
        <Icon name="link-token" size={16} />
        Asked for a time · {request.askedOn}
      </p>
      <p className="t-title" style={{ margin: "6px 0 2px", fontSize: "1.0625rem" }}>
        {request.patientName}
      </p>
      {request.phone && (
        <a className="t-mono" href={phoneHref(request.phone)} style={{ color: "var(--color-aqua-text)" }}>
          {phoneDisplay(request.phone)}
        </a>
      )}
      <p className="t-secondary" style={{ margin: "6px 0 0" }}>
        Prefers {request.windows.join(", ")}
        {request.note ? ` · “${request.note}”` : ""}
      </p>

      <form action={confirmAction} style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <input type="hidden" name="requestId" value={request.id} />
        <input type="hidden" name="patientId" value={request.patientId} />
        <label style={{ display: "grid", gap: 4 }}>
          <span className="t-label">Appointment date</span>
          <input className="input" type="date" name="appointmentOn" defaultValue={today} min={today} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={confirming}>
          {confirming ? "Recording…" : "Mark booked"}
        </button>
        {confirmState.error && (
          <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", margin: 0 }}>
            {confirmState.error}
          </p>
        )}
      </form>

      <form action={dismissAction} style={{ marginTop: 8 }}>
        <input type="hidden" name="requestId" value={request.id} />
        <button className="btn-quiet" type="submit" disabled={dismissing}>
          {dismissing ? "Closing…" : "Close without booking"}
        </button>
      </form>
    </div>
  );
}
