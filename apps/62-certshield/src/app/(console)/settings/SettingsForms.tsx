"use client";

import { useActionState } from "react";
import {
  rotateHookKeyAction,
  runTickNowAction,
  saveSettingsAction,
  type SettingsState,
} from "./actions";
import { logoutAction } from "../../(auth)/actions";

const INITIAL: SettingsState = { error: null, ok: null };

export function SettingsForm({
  name,
  holderName,
  timezone,
  tone,
  chaseOffsets,
}: {
  name: string;
  holderName: string;
  timezone: string;
  tone: "plain" | "firm";
  chaseOffsets: number[];
}) {
  const [state, action, pending] = useActionState(saveSettingsAction, INITIAL);

  return (
    <form action={action} style={{ marginTop: 16, maxWidth: 560 }}>
      <div className="field">
        <label className="field-label" htmlFor="s-name">
          Company
        </label>
        <input id="s-name" name="name" className="input" defaultValue={name} required />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="s-holder">
          Certificate holder wording
        </label>
        <input id="s-holder" name="holderName" className="input" defaultValue={holderName} />
        <p className="field-help">
          What a certificate&apos;s holder box has to name. CertShield compares loosely — &ldquo;Mgmt,
          LLC&rdquo; matches &ldquo;Management LLC&rdquo; — but it never assumes a match it cannot see.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="s-timezone">
          Time zone
        </label>
        <input
          id="s-timezone"
          name="timezone"
          className="input input-mono"
          defaultValue={timezone}
          placeholder="America/Los_Angeles"
        />
        <p className="field-help">
          Decides what &ldquo;today&rdquo; means for every expiry. A policy expiring on the 20th expires
          on the 20th where your office is.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="s-offsets">
          Renewal request days
        </label>
        <input
          id="s-offsets"
          name="chaseOffsets"
          className="input input-mono"
          defaultValue={chaseOffsets.join(", ")}
          placeholder="30, 14, 7, 1"
        />
        <p className="field-help">
          Days before expiry at which a renewal request goes out. Each fires exactly once per renewal
          cycle. Supported rungs are 30, 14, 7 and 1.
        </p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="s-tone">
          Chase signature
        </label>
        <select id="s-tone" name="tone" className="input" defaultValue={tone}>
          <option value="plain">Signed &ldquo;Compliance team&rdquo;</option>
          <option value="firm">Signed &ldquo;Compliance&rdquo;</option>
        </select>
      </div>

      {state.error && (
        <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" role="status" style={{ marginBottom: 12 }}>
          {state.ok}
        </p>
      )}

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function RotateHookKeyButton() {
  const [state, action, pending] = useActionState(rotateHookKeyAction, INITIAL);
  return (
    <form action={action} style={{ marginTop: 12 }}>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Issuing…" : "Issue a new key"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" role="status" style={{ marginTop: 8 }}>
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function RunTickButton() {
  const [state, action, pending] = useActionState(runTickNowAction, INITIAL);
  return (
    <form action={action} style={{ marginTop: 12 }}>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Running…" : "Run the nightly pass now"}
      </button>
      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" role="status" style={{ marginTop: 8 }}>
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction} style={{ marginTop: 12 }}>
      <button type="submit" className="btn btn-secondary">
        Sign out
      </button>
    </form>
  );
}
