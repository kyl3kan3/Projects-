"use client";

/**
 * Licence vault forms: add a credential, record a renewal.
 *
 * The renewal form is deliberately its own small form per row — a renewal is the
 * moment the expiry ladder is re-planned, and burying it in a modal is how it stops
 * getting recorded.
 */

import { useActionState, useState } from "react";
import {
  addCredentialAction,
  deleteCredentialAction,
  renewCredentialAction,
  type CredentialFormState,
} from "./actions";
import { HoldToConfirm } from "@/components/HoldToConfirm";
import { CREDENTIAL_HINT, CREDENTIAL_KINDS, CREDENTIAL_LABEL } from "@/lib/credentials";
import type { CredentialKind } from "@/db/schema";

const initial: CredentialFormState = { error: null, ok: null };

export function AddCredentialForm({ members }: { members: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(addCredentialAction, initial);
  const [kind, setKind] = useState<CredentialKind>("contractor_license");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="thumb-cta">
        <button type="button" className="btn btn-primary btn-full" onClick={() => setOpen(true)}>
          Add a licence or cert
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="sheet mt-6 flex flex-col gap-4">
      <p className="t-label">New credential</p>

      <div className="chiprow">
        {CREDENTIAL_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            className="chip"
            data-active={kind === option}
            onClick={() => setKind(option)}
            aria-pressed={kind === option}
          >
            {CREDENTIAL_LABEL[option]}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />

      <label className="block">
        <span className="t-label">Number</span>
        <input className="input input-mono mt-2" name="number" required placeholder={CREDENTIAL_HINT[kind]} />
      </label>

      <label className="block">
        <span className="t-label">Issuing authority</span>
        <input
          className="input mt-2"
          name="issuingAuthority"
          required
          placeholder="Arizona Registrar of Contractors"
        />
      </label>

      <label className="block">
        <span className="t-label">Held by</span>
        <input className="input mt-2" name="holder" required placeholder="Ridgeline Mechanical LLC" />
      </label>

      <label className="block">
        <span className="t-label">Expires</span>
        <input className="input input-mono mt-2" name="expiresAt" type="date" required />
      </label>

      <label className="block">
        <span className="t-label">Renewal link (optional)</span>
        <input className="input mt-2" name="renewalUrl" placeholder="https://roc.az.gov/renew" />
      </label>

      {members.length > 1 && (
        <label className="block">
          <span className="t-label">Who chases it</span>
          <select className="input mt-2" name="assignedUserId" defaultValue="">
            <option value="">The owner</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="t-label">Notes (optional)</span>
        <textarea className="input mt-2" name="notes" placeholder="Bond rider renews on the same date" />
      </label>

      {state.error && (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save credential"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </form>
  );
}

/**
 * Removing a credential also cancels its outstanding notices, which is exactly why
 * it is a hold and not a tap: a mis-tap here silences a renewal warning.
 */
export function RemoveCredentialButton({ credentialId }: { credentialId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <>
      <HoldToConfirm
        label="Remove"
        holdingLabel="Hold to remove…"
        hint="Hold to remove this credential. Removing it also cancels its expiry notices."
        onConfirm={() => {
          setPending(true);
          const data = new FormData();
          data.set("credentialId", credentialId);
          void deleteCredentialAction(data);
        }}
      />
      {pending && <span className="t-secondary">Removing…</span>}
    </>
  );
}

export function RenewForm({ credentialId }: { credentialId: string }) {
  const [state, action, pending] = useActionState(renewCredentialAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet btn-quiet-sm" onClick={() => setOpen(true)}>
        Record a renewal
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-3">
      <input type="hidden" name="credentialId" value={credentialId} />
      <label className="block">
        <span className="t-label">New expiry</span>
        <input className="input input-mono mt-2" name="expiresAt" type="date" required />
      </label>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Renew"}
      </button>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error && (
        <p className="t-secondary w-full" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary w-full" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </p>
      )}
    </form>
  );
}
