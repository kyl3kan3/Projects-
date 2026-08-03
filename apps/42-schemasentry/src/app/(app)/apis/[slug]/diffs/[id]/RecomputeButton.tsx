"use client";

/**
 * "Re-run on the current policy."
 *
 * `diffs.verdict` is stored so a timeline row does not have to load a hundred
 * findings to print one word. It is written in the same transaction as the
 * findings, so it cannot drift on its own — but a *policy* edit changes what
 * those findings mean without touching the diff, and a screen that quietly shows
 * yesterday's verdict under today's rules is the exact stale-status trap this
 * product exists to avoid. So the policy edit tells you to re-run, and this is
 * the button that does it.
 */

import { useActionState } from "react";
import { recomputeAction } from "../actions";
import { EMPTY_STATE } from "@/lib/form-state";

export function RecomputeButton({ diffId, engineVersion }: { diffId: string; engineVersion: string }) {
  const [state, action, pending] = useActionState(recomputeAction, EMPTY_STATE);

  return (
    <form action={action} style={{ marginTop: 8 }}>
      <input type="hidden" name="diffId" value={diffId} />
      <button type="submit" className="btn-quiet" disabled={pending}>
        {pending ? "Re-running…" : "Re-run on the current policy"}
      </button>
      {state.ok ? (
        <p role="status" className="t-secondary" style={{ color: "var(--color-green)", margin: "4px 0 0" }}>
          {state.ok}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="t-secondary" style={{ color: "var(--color-break-text)", margin: "4px 0 0" }}>
          {state.error}
        </p>
      ) : null}
      <span className="sr-only">This diff was computed by engine {engineVersion}.</span>
    </form>
  );
}
