"use client";

import { useActionState } from "react";
import { tenantPostMessageAction, type PortalState } from "../../actions";
import { IconCamera } from "@/components/icons";

export function TenantReplyForm({ token, requestId }: { token: string; requestId: string }) {
  const [state, formAction, pending] = useActionState<PortalState, FormData>(tenantPostMessageAction, {});

  return (
    <section>
      <h2 className="t-label mb-3">Add to this</h2>
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="requestId" value={requestId} />

        <label className="field">
          <span className="sr-only">Your message</span>
          <textarea className="input" name="body" rows={3} placeholder="Thursday morning works, I will be in until 11." />
        </label>

        <label className="field">
          <span className="t-label flex items-center gap-2">
            <IconCamera size={18} />
            Photos
          </span>
          <input
            className="input"
            style={{ paddingTop: 12, minHeight: 48 }}
            type="file"
            name="photos"
            accept="image/jpeg,image/png,image/webp"
            multiple
            capture="environment"
          />
        </label>

        {state.error ? (
          <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="t-secondary" style={{ color: "var(--color-rent-green)" }} role="status">
            {state.message}
          </p>
        ) : null}

        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </section>
  );
}
