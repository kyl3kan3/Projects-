"use client";

import { useActionState } from "react";
import { portalUploadAction, type PortalUploadState } from "./actions";
import { IconUpload } from "@/components/icons";

const initial: PortalUploadState = { error: null, ok: null };

export function PortalUpload({
  token,
  taskId,
  label,
}: {
  token: string;
  taskId: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(portalUploadAction, initial);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="taskId" value={taskId} />
      <input
        className="input"
        type="file"
        name="file"
        required
        aria-label={`Send your ${label}`}
        accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.txt,.doc,.docx"
      />
      <button className="btn btn-primary btn-full mt-3" type="submit" disabled={pending}>
        <IconUpload size={18} />
        {pending ? "Sending…" : "Send it"}
      </button>
      {state.error ? (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary mt-2" style={{ color: "var(--color-cedar-strong)" }} role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
