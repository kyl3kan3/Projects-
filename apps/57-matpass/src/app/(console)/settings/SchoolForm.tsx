"use client";

import { ActionForm } from "@/components/ActionForm";
import { updateSchoolAction } from "./actions";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Dublin",
  "Australia/Sydney",
];

export function SchoolForm({
  name,
  timezone,
  canEdit,
  retentionBaselineFraction,
  retentionMinDaysAbsent,
  kioskPinEnabled,
}: {
  name: string;
  timezone: string;
  canEdit: boolean;
  retentionBaselineFraction: number;
  retentionMinDaysAbsent: number;
  kioskPinEnabled: boolean;
}) {
  if (!canEdit) {
    return (
      <p className="t-secondary fg-3">
        {name} · {timezone}. Only the owner can change these.
      </p>
    );
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      <ActionForm action={updateSchoolAction} submitLabel="Save" variant="secondary">
        <div className="field">
          <label className="t-label" htmlFor="sname">
            School name
          </label>
          <input id="sname" name="name" className="input" required defaultValue={name} />
        </div>
        <div className="field">
          <label className="t-label" htmlFor="stz">
            Timezone
          </label>
          <select id="stz" name="timezone" className="input" defaultValue={timezone}>
            {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace("_", " ")}
              </option>
            ))}
          </select>
          <p className="t-secondary fg-3">
            Class times, days-in-rank and the nightly scan all run on this clock.
          </p>
        </div>
        <div className="split-even">
          <div className="field">
            <label className="t-label" htmlFor="sfrac">
              Flag below this share of baseline
            </label>
            <input
              id="sfrac"
              name="retentionBaselineFraction"
              className="input input-mono"
              defaultValue={retentionBaselineFraction}
              inputMode="decimal"
            />
          </div>
          <div className="field">
            <label className="t-label" htmlFor="sdays">
              …and this many days away
            </label>
            <input
              id="sdays"
              name="retentionMinDaysAbsent"
              type="number"
              min={3}
              max={90}
              className="input input-mono"
              defaultValue={retentionMinDaysAbsent}
            />
          </div>
        </div>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="kioskPinEnabled"
            className="check"
            defaultChecked={kioskPinEnabled}
          />
          <span className="t-body">Allow PIN entry at the kiosk</span>
        </label>
      </ActionForm>
    </div>
  );
}
