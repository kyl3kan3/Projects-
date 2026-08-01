"use client";

import { useActionState } from "react";
import { consentAction, type ConsentState } from "./actions";

export function ConsentForm({ token, expectedName }: { token: string; expectedName: string }) {
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(consentAction, {});

  if (state.ok) {
    return (
      <div className="notice" data-tone="good">
        <p className="t-title">Authorised. Thank you.</p>
        <p className="t-secondary mt-2">
          Your landlord can now order the check. The date, your typed name and your IP address have been recorded as your
          authorisation.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      <label className="flex items-start gap-3">
        <input type="checkbox" name="agree" className="mt-1" required />
        <span className="t-body">
          I authorise a tenant screening check on me for this rental application, and I understand what will be obtained.
        </span>
      </label>

      <label className="field">
        <span className="t-label">Type your full name to sign</span>
        <input className="input" name="typedName" required placeholder={expectedName} autoComplete="off" />
        <span className="t-secondary">Exactly as it is on your application: {expectedName}</span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Recording…" : "Authorise the check"}
      </button>
      <p className="t-secondary">
        Change your mind and simply close this page — nothing is authorised until you press the button.
      </p>
    </form>
  );
}
