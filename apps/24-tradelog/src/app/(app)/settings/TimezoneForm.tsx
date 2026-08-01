"use client";

import { useActionState } from "react";
import { saveTimezoneAction, type SettingsFormState } from "./actions";
import { TIMEZONES } from "@/lib/tz";
import { IconAlert } from "@/components/icons";

export function TimezoneForm({ timezone }: { timezone: string }) {
  const [state, formAction, pending] = useActionState<SettingsFormState, FormData>(
    saveTimezoneAction,
    {},
  );
  const options = TIMEZONES.includes(timezone as (typeof TIMEZONES)[number])
    ? TIMEZONES
    : [timezone, ...TIMEZONES];

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="t-label">Trading timezone</span>
        <select className="input" name="timezone" defaultValue={timezone}>
          {options.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
      <p className="t-secondary">
        Time-of-day and day-of-week findings are measured on this clock, and broker exports that write
        local time with no offset are read in it. Changing it recomputes every finding.
      </p>
      {state.error ? (
        <p className="t-secondary flex items-start gap-2" role="alert">
          <IconAlert size={14} className="mt-1 shrink-0" />
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="t-secondary" style={{ color: "var(--color-blue)" }} role="status">
          Saved, and the findings were recomputed.
        </p>
      ) : null}
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save timezone"}
      </button>
    </form>
  );
}
