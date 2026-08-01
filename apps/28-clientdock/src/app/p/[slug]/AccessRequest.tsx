"use client";

import { useActionState } from "react";
import { requestAccessAction, type PortalActionState } from "./actions";

/**
 * The re-auth path. There is no password to offer and no account to make: a client
 * asks for another link, and the answer never reveals whether their address is on
 * the portal.
 */
export function AccessRequest({ slug, agencyName }: { slug: string; agencyName: string }) {
  const [state, formAction, pending] = useActionState<PortalActionState, FormData>(
    requestAccessAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />
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
        {pending ? "Sending…" : "Send me a link"}
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
        {agencyName} sends the link. There is no password here, and never will be.
      </p>
    </form>
  );
}
