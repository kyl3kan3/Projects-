"use client";

import { useActionState } from "react";
import { requestAccessByDomainAction, type PortalActionState } from "./p/[slug]/actions";

/**
 * The root of an agency's own portal domain. A client who has lost their link asks
 * for another here, and gets one for every live portal they are on.
 */
export function AgencyDoor({ workspaceId, agencyName }: { workspaceId: string; agencyName: string }) {
  const [state, formAction, pending] = useActionState<PortalActionState, FormData>(
    requestAccessByDomainAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <label className="flex flex-col gap-2">
        <span className="t-label">Your email</span>
        <input
          className="input input-mono"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@yourcompany.com"
        />
      </label>
      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send me my link"}
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
      <p className="t-secondary">
        No password, and no account to make — {agencyName} sends a link that opens your portal.
      </p>
    </form>
  );
}
