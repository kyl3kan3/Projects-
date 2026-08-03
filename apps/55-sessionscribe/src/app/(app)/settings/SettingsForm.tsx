"use client";

/**
 * Clinician profile and practice settings. The signature block is here because it
 * is what appears under every note the clinician signs — it belongs beside the
 * credentials, not buried in a billing screen.
 */

import { useActionState } from "react";
import { saveSettingsAction, type SettingsState } from "./actions";

const initial: SettingsState = {};

const ZONES = [
  ["America/New_York", "Eastern"],
  ["America/Chicago", "Central"],
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
] as const;

export function SettingsForm({
  name,
  credentials,
  signatureBlock,
  defaultFormat,
  practiceName,
  timezone,
  notifyOnDraftReady,
}: {
  name: string;
  credentials: string;
  signatureBlock: string;
  defaultFormat: string;
  practiceName: string;
  timezone: string;
  notifyOnDraftReady: boolean;
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, initial);

  return (
    <form action={action} className="panel p-4">
      <label className="field">
        <span className="field-label">Your name</span>
        <input className="input" name="name" defaultValue={name} required />
      </label>
      <label className="field">
        <span className="field-label">Credentials</span>
        <input
          className="input"
          name="credentials"
          defaultValue={credentials}
          placeholder="LMFT #114382"
          required
        />
        <span className="field-help">
          You type these to sign a note, and they are stored on every signature at the
          moment you sign.
        </span>
      </label>
      <label className="field">
        <span className="field-label">Signature block</span>
        <input
          className="input"
          name="signatureBlock"
          defaultValue={signatureBlock}
          placeholder="Dana Alvarez, LMFT #114382"
        />
      </label>
      <label className="field">
        <span className="field-label">Default note format</span>
        <select className="input" name="defaultFormat" defaultValue={defaultFormat}>
          <option value="soap">SOAP</option>
          <option value="dap">DAP</option>
        </select>
      </label>
      <label className="field">
        <span className="field-label">Practice name</span>
        <input
          className="input"
          name="practiceName"
          defaultValue={practiceName}
          required
        />
      </label>
      <label className="field">
        <span className="field-label">Timezone</span>
        <select className="input" name="timezone" defaultValue={timezone}>
          {ZONES.map(([value, label]) => (
            <option key={value} value={value}>
              {label} — {value}
            </option>
          ))}
        </select>
        <span className="field-help">
          Every time in the product, and the monthly note count, are read in this zone.
        </span>
      </label>
      <label className="mb-5 flex items-start gap-3">
        <input
          type="checkbox"
          name="notifyOnDraftReady"
          defaultChecked={notifyOnDraftReady}
          className="mt-1 h-5 w-5 flex-none"
          style={{ accentColor: "var(--color-sage)" }}
        />
        <span className="t-secondary">
          Email me when a draft is ready. The message says only that one is ready — never
          a client label, a time, or any part of the note.
        </span>
      </label>

      {state.error && (
        <p className="field-error mb-3" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary mb-3" style={{ color: "var(--color-sage-text)" }}>
          Saved.
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
