"use client";

import { useActionState, useState } from "react";
import { Icon } from "@/components/icons";
import type { BookingState } from "./actions";

/**
 * The patient's screen: window chips, a phone confirm, one primary button.
 * One screen at 390px, and every target is >=44px because this is being tapped
 * one-handed on a phone in a car park.
 */
export function BookingForm({
  token,
  firstName,
  phone,
  windows,
  locationPhone,
  action,
}: {
  token: string;
  firstName: string;
  phone: string;
  windows: { value: string; label: string }[];
  locationPhone: string | null;
  action: (state: BookingState, formData: FormData) => Promise<BookingState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, done: false });
  const [selected, setSelected] = useState<string[]>([]);

  if (state.done) {
    return (
      <div className="card" style={{ padding: 20, display: "grid", gap: 8 }}>
        <span style={{ color: "var(--color-green)" }}>
          <Icon name="check-seat" size={22} />
        </span>
        <p className="t-title" style={{ margin: 0 }}>
          Thank you, {firstName} — we have your times.
        </p>
        <p className="t-secondary" style={{ margin: 0 }}>
          The front desk will call to confirm the exact slot, usually the same working day. Nothing is
          booked until they speak to you.
          {locationPhone ? ` If you would rather call us, we are on ${locationPhone}.` : ""}
        </p>
      </div>
    );
  }

  const toggle = (value: string) =>
    setSelected((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );

  return (
    <form action={formAction} style={{ display: "grid", gap: 20 }}>
      <input type="hidden" name="token" value={token} />

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="t-label" style={{ padding: 0, marginBottom: 8 }}>
          Which of these suit you?
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {windows.map((window) => {
            const active = selected.includes(window.value);
            return (
              <label
                key={window.value}
                className="chip chip-lg"
                data-active={active}
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  name="window"
                  value={window.value}
                  checked={active}
                  onChange={() => toggle(window.value)}
                  style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
                />
                {active && <Icon name="check-seat" size={16} />}
                {window.label}
              </label>
            );
          })}
        </div>
        <p className="t-secondary" style={{ margin: "8px 0 0" }}>
          Pick as many as work — more options means we can usually find you something this week.
        </p>
      </fieldset>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Best number to reach you</span>
        <input
          className="input"
          type="tel"
          name="phone"
          defaultValue={phone}
          placeholder="(512) 555-0147"
          autoComplete="tel"
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Anything we should know? (optional)</span>
        <input className="input" name="note" placeholder="Mornings before 9 are easiest" maxLength={400} />
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", margin: 0 }}>
          {state.error}
        </p>
      )}

      <button className="btn btn-primary" type="submit" disabled={pending || selected.length === 0}>
        {pending ? "Sending…" : "Request a time"}
      </button>
    </form>
  );
}
