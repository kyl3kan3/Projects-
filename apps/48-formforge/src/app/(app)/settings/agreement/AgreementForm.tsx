"use client";

import { useActionState, useState } from "react";
import { acceptAgreementAction, type AgreementFormState } from "../actions";
import { IconAlert } from "@/components/icons";

/**
 * Acceptance capture. Deliberately shaped like the patient's signature block: a
 * typed full name, a hash of the exact text, a timestamp, and an audit row — the
 * same evidence discipline applied to the practice's own paperwork.
 */
export function AgreementForm({
  stale,
  previousSigner,
}: {
  stale: boolean;
  previousSigner: string | null;
}) {
  const [state, formAction, pending] = useActionState<AgreementFormState, FormData>(
    acceptAgreementAction,
    { error: null },
  );
  // Controlled: React 19 clears an uncontrolled form after the action resolves, and
  // a rejected half-name should not make someone retype their whole name.
  const [signerName, setSignerName] = useState("");

  return (
    <form action={formAction}>
      {stale && (
        <p className="t-secondary mb-4">
          {previousSigner} accepted an earlier version. Accepting again records the new version and
          leaves the old acceptance on the record.
        </p>
      )}
      <label className="field">
        <span className="field-label">Your full name</span>
        <input
          className="input"
          name="signerName"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          autoComplete="name"
          required
        />
        <span className="field-help">
          Recorded with the time, the version, and a SHA-256 hash of the text above.
        </span>
      </label>

      {state.error && (
        <p
          className="mb-4 flex items-start gap-2 text-[13px] leading-[1.45]"
          style={{ color: "var(--color-clay)" }}
          role="alert"
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      )}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Recording…" : "I have read this"}
      </button>
    </form>
  );
}
