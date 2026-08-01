"use client";

import { useActionState } from "react";
import { clientUploadAction, type PortalActionState } from "../actions";

/** The client's own upload. Lands in a "From you" folder, versioned like anything else. */
export function ClientUpload({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState<PortalActionState, FormData>(
    clientUploadAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input className="input" name="file" type="file" required style={{ paddingTop: 12 }} />
      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send it over"}
      </button>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-amber)" }}>
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" style={{ color: "var(--color-green)" }} role="status">
          {state.ok}
        </p>
      ) : null}
    </form>
  );
}
