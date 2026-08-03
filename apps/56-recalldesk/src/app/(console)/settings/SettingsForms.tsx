"use client";

import { useActionState } from "react";
import type { SettingsState } from "./actions";

type Action = (state: SettingsState, formData: FormData) => Promise<SettingsState>;

const TIMEZONES: [string, string][] = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
];

function Status({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="t-secondary" role="alert" style={{ color: "var(--color-red)", margin: 0 }}>
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p className="t-secondary" role="status" style={{ color: "var(--color-green)", margin: 0 }}>
        Saved.
      </p>
    );
  }
  return null;
}

export function PracticeForm({
  action,
  practiceName,
  visitValueCents,
  attributionWindowDays,
  canEdit,
}: {
  action: Action;
  practiceName: string;
  visitValueCents: number;
  attributionWindowDays: number;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Practice name</span>
        <input className="input" name="practiceName" defaultValue={practiceName} disabled={!canEdit} />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Estimated hygiene-visit value ($)</span>
        <input
          className="input"
          type="number"
          name="visitValueDollars"
          min={1}
          max={5000}
          step="1"
          defaultValue={Math.round(visitValueCents / 100)}
          disabled={!canEdit}
        />
        <span className="t-secondary">
          Every recovered dollar in the ledger is this number. Attribution rows already written keep the
          value they were written with — changing it never restates history.
        </span>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Attribution window (days)</span>
        <input
          className="input"
          type="number"
          name="attributionWindowDays"
          min={1}
          max={180}
          defaultValue={attributionWindowDays}
          disabled={!canEdit}
        />
        <span className="t-secondary">
          A booking counts only if a touch reached the patient this many days before it. Shorter is more
          conservative — and more believable.
        </span>
      </label>

      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending || !canEdit}>
        {pending ? "Saving…" : "Save practice settings"}
      </button>
    </form>
  );
}

export function LocationForm({
  action,
  location,
  canEdit,
}: {
  action: Action;
  location: {
    id: string;
    name: string;
    phone: string | null;
    bookingNotice: string;
    quietStartHour: number;
    quietEndHour: number;
    hourlySendCap: number;
    timezone: string;
  };
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <input type="hidden" name="locationId" value={location.id} />

      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Location name</span>
        <input className="input" name="name" defaultValue={location.name} disabled={!canEdit} />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Phone shown to patients</span>
        <input
          className="input"
          name="phone"
          defaultValue={location.phone ?? ""}
          placeholder="(512) 555-0147"
          disabled={!canEdit}
        />
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Line on the booking page</span>
        <textarea
          className="input"
          name="bookingNotice"
          defaultValue={location.bookingNotice}
          disabled={!canEdit}
        />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="t-label">Sending starts</span>
          <input
            className="input"
            type="number"
            name="quietStartHour"
            min={0}
            max={23}
            defaultValue={location.quietStartHour}
            disabled={!canEdit}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="t-label">Sending ends</span>
          <input
            className="input"
            type="number"
            name="quietEndHour"
            min={1}
            max={23}
            defaultValue={location.quietEndHour}
            disabled={!canEdit}
          />
        </label>
      </div>
      <p className="t-secondary" style={{ margin: 0 }}>
        In {location.timezone.replace("_", " ")} — this location&rsquo;s own clock, not the server&rsquo;s.
      </p>

      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Touches per hour</span>
        <input
          className="input"
          type="number"
          name="hourlySendCap"
          min={1}
          max={2000}
          defaultValue={location.hourlySendCap}
          disabled={!canEdit}
        />
        <span className="t-secondary">
          Deliverability pacing. A thousand emails in one minute is how a sending domain gets filtered.
        </span>
      </label>

      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending || !canEdit}>
        {pending ? "Saving…" : "Save location"}
      </button>
    </form>
  );
}

export function AddLocationForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">New location name</span>
        <input className="input" name="name" placeholder="Cedar Hollow — Oak Ave" required />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Time zone</span>
        <select className="input" name="timezone" defaultValue="America/Chicago">
          {TIMEZONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add location"}
      </button>
    </form>
  );
}

export function SwitchLocationForm({
  action,
  locations,
  currentId,
}: {
  action: Action;
  locations: { id: string; name: string }[];
  currentId: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  if (locations.length < 2) return null;
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Working location</span>
        <select className="input" name="locationId" defaultValue={currentId}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Switching…" : "Switch"}
      </button>
    </form>
  );
}

export function InviteForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Name</span>
        <input className="input" name="name" placeholder="Marisol Vega" required />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Email</span>
        <input className="input" type="email" name="email" placeholder="front-desk@cedarhollowdental.com" required />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Role</span>
        <select className="input" name="role" defaultValue="front_desk">
          <option value="front_desk">Front desk — the call queue and booking requests</option>
          <option value="office_manager">Office manager — imports and campaigns too</option>
          <option value="owner">Owner — everything, including billing</option>
        </select>
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="t-label">Starting password</span>
        <input className="input" type="password" name="password" minLength={8} required />
        <span className="t-secondary">Tell it to them in person; they can change it after signing in.</span>
      </label>
      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add person"}
      </button>
    </form>
  );
}

export function SignOutForm({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button className="btn-quiet" type="submit" style={{ color: "var(--color-red)" }}>
        Sign out
      </button>
    </form>
  );
}
