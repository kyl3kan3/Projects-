"use client";

import { useActionState } from "react";
import { runRemindersAction, saveSettingsAction, type SettingsState } from "./actions";

const initial: SettingsState = { error: null, ok: null };

/** React 19 resets the form after the action returns; this restores the edit. */
function kept(state: SettingsState, key: string, fallback: string): string {
  return state.values?.[key] ?? fallback;
}

const STATES = [
  ["TX", "Texas"],
  ["CO", "Colorado"],
  ["MA", "Massachusetts"],
  ["IL", "Illinois"],
  ["AZ", "Arizona"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["NC", "North Carolina"],
  ["TN", "Tennessee"],
  ["WA", "Washington"],
] as const;

const ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona (no DST)"],
  ["America/Los_Angeles", "Pacific"],
] as const;

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="field-error" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="t-secondary mt-2" style={{ color: "var(--color-cedar-strong)" }} role="status">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function DeskSettingsForm({
  name,
  state,
  timezone,
  offsets,
  alwaysNotifyCoordinator,
  readOnly,
}: {
  name: string;
  state: string;
  timezone: string;
  offsets: number[];
  alwaysNotifyCoordinator: boolean;
  readOnly: boolean;
}) {
  const [result, action, pending] = useActionState(saveSettingsAction, initial);
  return (
    <form action={action}>
      <label className="field max-w-lg">
        <span className="field-label">Desk name</span>
        <input
          className="input"
          name="name"
          defaultValue={kept(result, "name", name)}
          required
          disabled={readOnly}
        />
      </label>

      <div className="grid max-w-lg gap-3 sm:grid-cols-2">
        <label className="field">
          <span className="field-label">State</span>
          <select
            className="input"
            name="state"
            defaultValue={kept(result, "state", state)}
            disabled={readOnly}
          >
            {STATES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
          <span className="field-help">
            Adds that state&rsquo;s recording-office closures to the US federal calendar.
          </span>
        </label>
        <label className="field">
          <span className="field-label">Time zone</span>
          <select
            className="input"
            name="timezone"
            defaultValue={kept(result, "timezone", timezone)}
            disabled={readOnly}
          >
            {ZONES.map(([tz, label]) => (
              <option key={tz} value={tz}>
                {label}
              </option>
            ))}
          </select>
          <span className="field-help">Decides which day &ldquo;today&rdquo; is on every timeline.</span>
        </label>
      </div>

      <label className="field max-w-lg">
        <span className="field-label">Reminder offsets (days before)</span>
        <input
          className="input input-mono"
          name="reminderOffsets"
          defaultValue={kept(result, "reminderOffsets", offsets.join(", "))}
          placeholder="7, 3, 1"
          disabled={readOnly}
        />
        <span className="field-help">
          Each date warns its owning parties at these distances, exactly once per rung. Nothing
          fires after a date has passed — the file shows MISSED instead.
        </span>
      </label>

      <label className="checkline max-w-lg">
        <input
          type="checkbox"
          name="alwaysNotifyCoordinator"
          defaultChecked={alwaysNotifyCoordinator}
          disabled={readOnly}
        />
        <span className="t-body">
          Copy the coordinator on every reminder, whoever owns the date
        </span>
      </label>

      <button className="btn btn-primary mt-4" type="submit" disabled={pending || readOnly}>
        {pending ? "Saving…" : "Save the desk"}
      </button>
      <Feedback state={result} />
    </form>
  );
}

export function RunRemindersForm({ dryRun }: { dryRun: boolean }) {
  const [result, action, pending] = useActionState(runRemindersAction, initial);
  return (
    <form action={action} className="mt-4">
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Running the pass…" : "Run the reminder pass now"}
      </button>
      <p className="field-help">
        {dryRun
          ? "DRY_RUN is on: the ledger is written and the message is logged, but nothing is emailed."
          : "This sends real email to every party whose date is inside a reminder window."}
      </p>
      <Feedback state={result} />
    </form>
  );
}
