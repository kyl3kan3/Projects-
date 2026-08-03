"use client";

/**
 * The changelog subscribe control. Keyboard-complete and reader-accessible, per
 * DESIGN.md: the public page is a document, and a document's form is a label, an
 * input and a button.
 */

import { useActionState } from "react";
import { subscribeAction } from "./actions";
import { EMPTY_SUBSCRIBE_STATE } from "@/lib/form-state";
import { IconRss } from "@/components/icons";

export function SubscribeForm({
  orgSlug,
  apiSlug,
  feedUrl,
}: {
  orgSlug: string;
  apiSlug: string;
  feedUrl: string;
}) {
  const [state, action, pending] = useActionState(subscribeAction, EMPTY_SUBSCRIBE_STATE);

  return (
    <section style={{ marginTop: 56 }} aria-labelledby="subscribe-heading">
      <h2 id="subscribe-heading" className="t-label" style={{ color: "var(--color-text-2)", margin: "0 0 12px" }}>
        Get told before it breaks you
      </h2>

      <form action={action} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <input type="hidden" name="org" value={orgSlug} />
        <input type="hidden" name="api" value={apiSlug} />
        <label className="field">
          <span className="sr-only">Your email address</span>
          <input
            className="input"
            name="email"
            type="email"
            required
            placeholder="you@yourcompany.example"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
          />
        </label>

        {state.error ? (
          <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: 0 }}>
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: 0 }}>
            {state.ok}
          </p>
        ) : null}

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Subscribing…" : "Email me changes"}
        </button>
      </form>

      <p className="t-secondary" style={{ marginTop: 16 }}>
        <a href={feedUrl} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <IconRss size={18} />
          RSS feed
        </a>
      </p>
    </section>
  );
}
