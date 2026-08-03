"use client";

/** Business details and digest cadence. One form, saved in place. */

import { useActionState, useTransition } from "react";
import { saveSettingsAction, signOutAction, type SettingsFormState } from "./actions";
import { TIME_ZONES, WEEKDAYS } from "@/lib/timezones";

const initial: SettingsFormState = { error: null, saved: false };

export function SettingsForm({
  name,
  timeZone,
  digestWeekday,
  weeklyDigestEnabled,
}: {
  name: string;
  timeZone: string;
  digestWeekday: number;
  weeklyDigestEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, initial);

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <label className="block">
        <span className="t-label">Business name</span>
        <input className="input mt-2" name="name" type="text" defaultValue={name} required />
      </label>

      <label className="block">
        <span className="t-label">Timezone</span>
        <select className="input mt-2" name="timeZone" defaultValue={timeZone}>
          {TIME_ZONES.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.label}
            </option>
          ))}
        </select>
        <span className="t-secondary mt-2 block" style={{ color: "var(--color-fg-3)" }}>
          Decides which month a receipt photographed late at night belongs to.
        </span>
      </label>

      <label className="block">
        <span className="t-label">Weekly digest day</span>
        <select className="input mt-2" name="digestWeekday" defaultValue={String(digestWeekday)}>
          {WEEKDAYS.map((day) => (
            <option key={day.id} value={day.id}>
              {day.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="weeklyDigestEnabled"
          defaultChecked={weeklyDigestEnabled}
          style={{ width: 22, height: 22, accentColor: "var(--color-ledger)" }}
        />
        <span className="t-body">Send me the weekly digest</span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="t-secondary" style={{ color: "var(--color-ledger)" }} role="status">
          Saved.
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-full"
      disabled={pending}
      onClick={() =>
        start(() => {
          void signOutAction();
        })
      }
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
