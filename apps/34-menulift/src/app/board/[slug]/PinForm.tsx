"use client";

import { useActionState, useTransition } from "react";
import { endBoardSessionAction, pinLoginAction, type PinState } from "./actions";

const INITIAL: PinState = { error: null };

/**
 * The PIN gate. Numeric keypad, big targets, a name field so the 86 log says
 * "by Dana" instead of "by expo station" — this is the only identity the board
 * needs, and typing an email on a phone at the pass is a non-starter.
 */
export function PinForm({ slug, locationName }: { slug: string; locationName: string }) {
  const [state, action, pending] = useActionState(pinLoginAction, INITIAL);
  return (
    <form action={action} style={{ display: "grid", gap: 16 }}>
      <input type="hidden" name="slug" value={slug} />
      <div>
        <p className="t-label" style={{ margin: 0 }}>
          {locationName}
        </p>
        <h1 className="t-h2" style={{ marginTop: 8, marginBottom: 8 }}>
          86 board
        </h1>
        <p className="t-secondary" style={{ margin: 0 }}>
          Enter the station PIN. This board can 86 and restore dishes — nothing else.
        </p>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Your name</span>
        <input
          className="input"
          name="name"
          placeholder="Dana"
          autoComplete="off"
          maxLength={40}
          required
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">PIN</span>
        <input
          className="input input-data"
          name="pin"
          inputMode="numeric"
          pattern="\d{4,6}"
          maxLength={6}
          autoComplete="off"
          placeholder="4 to 6 digits"
          required
          style={{ letterSpacing: "0.4em", fontSize: 20 }}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ margin: 0, color: "#c05a3e" }}>
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-block" type="submit" disabled={pending}>
        {pending ? "Opening…" : "Open the board"}
      </button>
    </form>
  );
}

export function EndSession({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      className="btn-quiet"
      type="button"
      style={{ color: "var(--fg-2)" }}
      onClick={() => startTransition(async () => endBoardSessionAction(slug))}
    >
      {pending ? "Closing…" : "Close this board"}
    </button>
  );
}
