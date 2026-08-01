"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addLocationAction,
  saveLocationAction,
  setPinAction,
  signOutAction,
} from "./actions";
import { EMPTY_SETTINGS } from "./state";
import { IconPlus } from "@/components/icons";

function Feedback({ state }: { state: { error: string | null; ok: string | null } }) {
  if (!state.error && !state.ok) return null;
  return (
    <p
      className="t-secondary"
      role="status"
      style={{ margin: 0, color: state.error ? "#c05a3e" : "#5f7e4e" }}
    >
      {state.error ?? state.ok}
    </p>
  );
}

export function LocationForm({
  name,
  address,
  timezone,
  rollover,
}: {
  name: string;
  address: string;
  timezone: string;
  rollover: number;
}) {
  const [state, action, pending] = useActionState(saveLocationAction, EMPTY_SETTINGS);
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Restaurant name</span>
        <input className="input" name="name" defaultValue={name} required />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Address (shown on the guest menu)</span>
        <input className="input" name="address" defaultValue={address} placeholder="1420 Frankford Ave" />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Timezone</span>
        <input className="input input-data" name="timezone" defaultValue={timezone} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Service day rolls over at</span>
        <select className="select input-data" name="rollover" defaultValue={String(rollover)}>
          {Array.from({ length: 24 }, (_, hour) => (
            <option key={hour} value={hour}>
              {String(hour).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </label>
      <p className="t-secondary" style={{ margin: 0 }}>
        &quot;Tonight&quot; on the 86 board runs from this hour, and 86&apos;d dishes come back then.
        4am keeps the closing crew on last night&apos;s numbers.
      </p>
      <Feedback state={state} />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState(setPinAction, EMPTY_SETTINGS);
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">{hasPin ? "New station PIN" : "Station PIN"}</span>
        <input
          className="input input-data"
          name="pin"
          inputMode="numeric"
          pattern="\d{4,6}"
          maxLength={6}
          placeholder="4 to 6 digits"
          autoComplete="off"
        />
      </label>
      <p className="t-secondary" style={{ margin: 0 }}>
        {hasPin
          ? "A PIN is set. It is stored hashed — we can't show it to you, only replace it."
          : "Staff enter this on the board page. It can 86 and restore dishes; it cannot see prices, margins, or billing."}
      </p>
      <Feedback state={state} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : hasPin ? "Replace PIN" : "Set PIN"}
        </button>
        {hasPin ? (
          <button className="btn btn-secondary" type="submit" name="clear" value="1">
            Remove the PIN
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AddLocationForm() {
  const [state, action, pending] = useActionState(addLocationAction, EMPTY_SETTINGS);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="btn-quiet" type="button" onClick={() => setOpen(true)}>
        <IconPlus size={18} /> Add a location
      </button>
    );
  }
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <input className="input" name="name" placeholder="Rossi &amp; Co — Kensington" required />
      <Feedback state={state} />
      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add location"}
        </button>
        <button className="btn-quiet" type="button" onClick={() => setOpen(false)} style={{ color: "var(--fg-2)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SignOutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn-quiet"
      type="button"
      style={{ color: "var(--fg-2)" }}
      onClick={() => startTransition(async () => signOutAction())}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
