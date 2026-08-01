"use client";

import { useActionState, useState } from "react";
import { IconCheck } from "@/components/icons";
import type { StorageFormState } from "../actions";

export function AddTargetForm({
  action,
}: {
  action: (prev: StorageFormState, form: FormData) => Promise<StorageFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [kind, setKind] = useState<"byo_s3" | "byo_r2">("byo_r2");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />

      <div>
        <p className="t-label mb-3">Provider</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="chip"
            aria-pressed={kind === "byo_r2"}
            onClick={() => setKind("byo_r2")}
          >
            Cloudflare R2
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={kind === "byo_s3"}
            onClick={() => setKind("byo_s3")}
          >
            AWS S3
          </button>
        </div>
        <p className="t-secondary mt-2">
          {kind === "byo_r2"
            ? "R2 has zero egress, which matters: a restore re-downloads every byte."
            : "S3 charges egress on restores. Fine for small databases, less fine for large ones."}
        </p>
      </div>

      <label className="flex flex-col gap-2">
        <span className="t-label">Bucket</span>
        <input className="input input-mono" name="bucket" required placeholder="acme-postgres-backups" />
      </label>

      {kind === "byo_r2" ? (
        <label className="flex flex-col gap-2">
          <span className="t-label">Endpoint</span>
          <input
            className="input input-mono"
            name="endpoint"
            required
            placeholder="https://<account-id>.r2.cloudflarestorage.com"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="t-label">Region</span>
          <input className="input input-mono" name="region" required placeholder="eu-west-2" />
        </label>
      )}

      <label className="flex flex-col gap-2">
        <span className="t-label">Prefix (optional)</span>
        <input className="input input-mono" name="prefix" placeholder="vaultback" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Access key ID</span>
        <input className="input input-mono" name="accessKeyId" required autoComplete="off" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Secret access key</span>
        <input
          className="input input-mono"
          name="secretAccessKey"
          type="password"
          required
          autoComplete="off"
        />
        <span className="t-secondary">
          Stored AES-256-GCM encrypted, under a key separate from the one protecting your snapshots.
          It needs write and delete on this bucket — delete is how retention pruning works.
        </span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          name="makeDefault"
          className="h-5 w-5"
          style={{ accentColor: "var(--color-brass)" }}
        />
        <span className="t-body">Make this the default for new databases</span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-torch)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p
          className="t-secondary flex items-center gap-2"
          style={{ color: "var(--color-seal)" }}
          role="status"
        >
          <IconCheck size={16} />
          Bucket verified by writing and deleting a probe object.
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Writing a probe object…" : "Verify and add"}
      </button>
    </form>
  );
}
