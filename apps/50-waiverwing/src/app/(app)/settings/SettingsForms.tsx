"use client";

import { useActionState } from "react";
import type { AccountSettings, Location } from "@/db/schema";
import {
  addLocationAction,
  rotateQrAction,
  updateLocationAction,
  updateSettingsAction,
  type SettingsState,
} from "./actions";

function Status({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p className="t-secondary" style={{ color: "var(--color-ember)" }} role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className="t-secondary" style={{ color: "var(--color-pine)" }} role="status">
        {state.ok}
      </p>
    );
  }
  return null;
}

export function LocationForm({ location }: { location: Location }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateLocationAction,
    {},
  );
  const [rotateState, rotate, rotating] = useActionState<SettingsState, FormData>(
    rotateQrAction,
    {},
  );

  return (
    <div className="mt-3 flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="locationId" value={location.id} />
        <label className="flex flex-col gap-2">
          <span className="t-label">Name</span>
          <input name="name" className="input" defaultValue={location.name} required />
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Timezone</span>
          <input
            name="timezone"
            className="input input-mono"
            defaultValue={location.timezone}
            required
          />
          <span className="t-secondary">
            Decides when a single-visit waiver expires and where the day boundary on the check-in
            board falls. An IANA name, e.g. America/Denver.
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="t-label">Kiosk PIN</span>
          <input
            name="kioskPin"
            className="input input-mono"
            defaultValue={location.kioskPin}
            inputMode="numeric"
            required
          />
          <span className="t-secondary">
            Staff type this once to put the counter tablet into kiosk mode. The kiosk holds a
            location-scoped session only — it can never reach this dashboard.
          </span>
        </label>
        <Status state={state} />
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save location"}
        </button>
      </form>

      <form action={rotate} className="hairline-t pt-4">
        <input type="hidden" name="locationId" value={location.id} />
        <p className="t-title">Poster code</p>
        <p className="t-data mt-1.5" style={{ color: "var(--color-text-2)" }}>
          {location.qrToken}
        </p>
        <p className="t-secondary mt-2">
          Rotating issues a new code and <strong>kills every printed poster</strong> using the old
          one. Only do this if a poster has been misused.
        </p>
        <Status state={rotateState} />
        <button
          className="btn btn-secondary mt-3"
          type="submit"
          disabled={rotating}
          style={{ color: "var(--color-ember)" }}
        >
          {rotating ? "Rotating…" : "Rotate the poster code"}
        </button>
      </form>
    </div>
  );
}

export function AddLocationForm({ allowed, current }: { allowed: number; current: number }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(addLocationAction, {});
  const atLimit = current >= allowed;

  return (
    <form action={action} className="mt-3 flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Name</span>
        <input name="name" className="input" placeholder="Granite Works — Boulder" required />
      </label>
      <label className="flex flex-col gap-2">
        <span className="t-label">Timezone</span>
        <input name="timezone" className="input input-mono" defaultValue="America/Denver" />
      </label>
      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending || atLimit}>
        {pending ? "Adding…" : "Add a location"}
      </button>
      <p className="t-secondary">
        {current} of {allowed} {allowed === 1 ? "location" : "locations"} used on your plan.
      </p>
    </form>
  );
}

export function AccountSettingsForm({
  settings,
  canRemoveFooter,
}: {
  settings: AccountSettings;
  canRemoveFooter: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    updateSettingsAction,
    {},
  );

  return (
    <form action={action} className="mt-3 flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Keep signed waivers for</span>
        <div className="flex items-center gap-3">
          <input
            name="retentionYears"
            type="number"
            min={1}
            max={25}
            className="input input-mono w-24"
            defaultValue={settings.retentionYears}
          />
          <span className="t-secondary">years</span>
        </div>
        <span className="t-secondary">
          Nothing is deleted automatically at MVP — this records your policy so the export and
          the incident file can state it. Check your own limitation period before shortening it.
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Daily digest hour</span>
        <input
          name="digestHour"
          type="number"
          min={0}
          max={23}
          className="input input-mono w-24"
          defaultValue={settings.digestHour}
        />
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="posterFooterOff"
          defaultChecked={!settings.posterFooter}
          disabled={!canRemoveFooter}
          className="mt-1"
        />
        <span>
          <span className="t-title block">Remove “Waivers by WaiverWing” from posters</span>
          <span className="t-secondary">
            {canRemoveFooter
              ? "Your plan allows an unbranded poster."
              : "Available on Operator. Until then the footer stays — it is how other operators find us."}
          </span>
        </span>
      </label>

      <Status state={state} />
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
