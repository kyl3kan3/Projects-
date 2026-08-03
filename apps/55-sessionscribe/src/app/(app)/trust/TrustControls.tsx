"use client";

/**
 * The retention control and "purge now". Purge is hold-to-confirm (600ms) per
 * DESIGN.md's rule for destructive actions, and it says plainly that it cannot be
 * undone before the clinician commits to the hold.
 */

import { useActionState, useRef, useState, useTransition } from "react";
import { purgeNowAction, setRetentionAction, type TrustState } from "./actions";
import { IconFlameOut } from "@/components/icons";

const initial: TrustState = {};

export function TrustControls({ retentionDays }: { retentionDays: number }) {
  const [state, action, pending] = useActionState(setRetentionAction, initial);
  const [purgeState, setPurgeState] = useState<TrustState>({});
  const [holding, setHolding] = useState(false);
  const [purging, startPurge] = useTransition();
  // A ref, not a state updater: starting a transition inside `setState(prev => …)`
  // is not a pure update and React 19 throws for it. See ReviewRoom's amend button.
  const holdingRef = useRef(false);

  const cancelHold = () => {
    holdingRef.current = false;
    setHolding(false);
  };

  const beginHold = () => {
    holdingRef.current = true;
    setHolding(true);
    window.setTimeout(() => {
      if (!holdingRef.current) return;
      cancelHold();
      startPurge(async () => setPurgeState(await purgeNowAction()));
    }, 600);
  };

  return (
    <div className="panel p-4">
      <form action={action}>
        <label className="field">
          <span className="field-label">Audio and transcript retention</span>
          <select className="input" name="retentionDays" defaultValue={retentionDays}>
            {[7, 14, 30, 60, 90, 180, 365].map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
          <span className="field-help">
            Shortening the window brings deletions forward for media that still exists.
            Nothing here can bring back media already purged.
          </span>
        </label>
        {state.error && (
          <p className="field-error mb-3" role="alert">
            {state.error}
          </p>
        )}
        {state.message && <p className="t-secondary mb-3">{state.message}</p>}
        <button className="btn btn-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save retention window"}
        </button>
      </form>

      <div className="hairline-t mt-5 pt-4">
        <p className="t-title mb-1">Purge everything past its window now</p>
        <p className="t-secondary mb-3">
          Runs the same sweep as the schedule. Deletions are permanent and each one is
          written to the log below.
        </p>
        {purgeState.message && <p className="t-secondary mb-3">{purgeState.message}</p>}
        <button
          className="btn btn-danger"
          type="button"
          onPointerDown={beginHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          disabled={purging}
        >
          <span className="inline-flex items-center gap-2">
            <IconFlameOut size={18} />
            {purging ? "Purging…" : holding ? "Hold to purge…" : "Purge now (hold)"}
          </span>
        </button>
      </div>
    </div>
  );
}
