"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import { money, phoneDisplay, phoneHref } from "@/lib/format";
import { bucketLabel, type OverdueBucket } from "@/lib/recall";
import type { QueueState } from "./actions";

/**
 * The call-queue card (DESIGN.md): card, radius 12, padding 16 — rank label
 * ("#3 · $310"), patient title, mono tap-to-dial phone, the context line, then the
 * two-tap disposition row of five 44px chips. Booked flips the card to a thin
 * green confirmation row.
 *
 * Two taps means two distinct taps: the first selects the outcome, the second
 * confirms it (and for "Booked", picks the appointment date in between). There is
 * no swipe-only path to anything.
 */
const OUTCOMES: { id: string; label: string }[] = [
  { id: "booked", label: "Booked" },
  { id: "left_message", label: "Left msg" },
  { id: "call_back", label: "Call back" },
  { id: "skip", label: "Skip" },
  { id: "do_not_contact", label: "DNC" },
];

export function QueueCard({
  task,
  action,
}: {
  task: {
    id: string;
    rank: number;
    name: string;
    phone: string | null;
    valueCents: number;
    bucket: OverdueBucket;
    context: string;
    status: string;
    note: string | null;
    handled: boolean;
  };
  action: (state: QueueState, formData: FormData) => Promise<QueueState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const [selected, setSelected] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  // A worked task collapses to a thin confirmation row — green when booked.
  if (task.handled) {
    return (
      <div
        className="hairline-b"
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 0" }}
      >
        <span
          style={{
            color: task.status === "booked" ? "var(--color-green)" : "var(--color-ink-2)",
            lineHeight: 0,
          }}
        >
          <Icon name={task.status === "booked" ? "check-seat" : "phone-handset"} size={18} />
        </span>
        <span className="t-secondary" style={{ flex: 1 }}>
          <strong style={{ fontWeight: 500, color: "var(--color-ink)" }}>{task.name}</strong> ·{" "}
          {statusWord(task.status)}
          {task.note ? ` · ${task.note}` : ""}
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} className="card" style={{ padding: 16, marginBottom: 12 }}>
      <input type="hidden" name="callTaskId" value={task.id} />

      <p className="t-label" style={{ margin: 0 }}>
        #{task.rank} · {money(task.valueCents)} · {bucketLabel(task.bucket)}
      </p>
      <p className="t-title" style={{ margin: "6px 0 2px", fontSize: "1.0625rem" }}>
        {task.name}
      </p>
      {task.phone ? (
        <a className="t-mono" href={phoneHref(task.phone)} style={{ color: "var(--color-aqua-text)" }}>
          {phoneDisplay(task.phone)}
        </a>
      ) : (
        <span className="t-secondary">No mobile number on file</span>
      )}
      <p className="t-secondary" style={{ margin: "6px 0 0" }}>
        {task.context}
      </p>

      <div
        role="group"
        aria-label="Outcome"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}
      >
        {OUTCOMES.map((outcome) => (
          <button
            key={outcome.id}
            type="button"
            className="chip chip-lg"
            data-active={selected === outcome.id}
            aria-pressed={selected === outcome.id}
            style={
              outcome.id === "do_not_contact" && selected === outcome.id
                ? { borderColor: "var(--color-red)", color: "var(--color-red)" }
                : undefined
            }
            onClick={() => setSelected(selected === outcome.id ? null : outcome.id)}
          >
            {outcome.label}
          </button>
        ))}
      </div>

      {selected && (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          <input type="hidden" name="outcome" value={selected} />

          {selected === "booked" && (
            <label style={{ display: "grid", gap: 4 }}>
              <span className="t-label">Appointment date</span>
              <input className="input" type="date" name="appointmentOn" defaultValue={today} min={today} />
              <span className="t-secondary">
                Book it in your PMS as usual — this records it here so the ledger can trace it.
              </span>
            </label>
          )}

          {selected === "do_not_contact" && (
            <p className="t-secondary" style={{ margin: 0, color: "var(--color-red)" }}>
              This is permanent: no campaign, call queue or sequence will include them again. It is
              written to the audit trail.
            </p>
          )}

          <label style={{ display: "grid", gap: 4 }}>
            <span className="t-label">Note (optional)</span>
            <input className="input" name="note" placeholder="Moving in June, call after the 20th" />
          </label>

          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Saving…" : `Confirm ${OUTCOMES.find((o) => o.id === selected)?.label}`}
          </button>
        </div>
      )}

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", marginTop: 12, marginBottom: 0 }}>
          {state.error}
        </p>
      )}
      {state.filled && (
        <p
          className="t-secondary receipt-line"
          style={{ color: "var(--color-aqua-text)", marginTop: 12, marginBottom: 0 }}
        >
          Attributed — a qualifying touch was inside the window, so the chair filled.
        </p>
      )}
    </form>
  );
}

function statusWord(status: string): string {
  switch (status) {
    case "booked":
      return "booked";
    case "left_message":
      return "left a message";
    case "call_back":
      return "call back";
    case "skip":
      return "skipped";
    case "do_not_contact":
      return "do not contact";
    default:
      return status;
  }
}
