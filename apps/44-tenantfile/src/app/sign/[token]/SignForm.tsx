"use client";

import { useActionState } from "react";
import { signAction, type SignState } from "./actions";

export function SignForm({
  token,
  role,
  expectedNames,
  consentSentence,
  otherSigned,
}: {
  token: string;
  role: "landlord" | "tenant";
  expectedNames: string[];
  consentSentence: string;
  otherSigned: boolean;
}) {
  const [state, formAction, pending] = useActionState<SignState, FormData>(signAction, {});

  if (state.ok) {
    return (
      <div className="notice" data-tone="good">
        <p className="t-title">Signed.</p>
        <p className="t-secondary mt-2">
          {state.fullySigned
            ? "Both parties have now signed. A sealed copy with the signature certificate has been filed, and the rent ledger is set up."
            : `Thank you. Waiting on the ${role === "landlord" ? "tenant" : "landlord"}; you will be told when it is complete.`}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />

      {otherSigned ? (
        <p className="t-secondary">
          The {role === "landlord" ? "tenant" : "landlord"} has already signed. Yours is the last signature.
        </p>
      ) : null}

      <label className="flex items-start gap-3">
        <input type="checkbox" name="agree" className="mt-1" required />
        <span className="t-body">{consentSentence}</span>
      </label>

      <label className="field">
        <span className="t-label">Type your full legal name</span>
        <input className="input" name="typedName" required autoComplete="off" placeholder={expectedNames[0] ?? ""} />
        <span className="t-secondary">
          It has to match the lease exactly: {expectedNames.join(" or ") || "the name on the lease"}
        </span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Signing…" : "Sign the lease"}
      </button>
      <p className="t-secondary">
        Your name, the time and your IP address are recorded and sealed into the signed PDF, which both of you get a copy
        of.
      </p>
    </form>
  );
}
