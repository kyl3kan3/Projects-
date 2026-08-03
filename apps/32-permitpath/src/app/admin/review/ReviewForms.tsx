"use client";

/**
 * Review-queue controls: reject a diff as noise, or attach it to the job type it
 * affects before editing that record.
 */

import { useActionState, useState } from "react";
import { rejectChangeAction, type CurationState } from "../actions";
import { assignChangeJobTypeAction } from "../actions";
import { JOB_TYPES, JOB_TYPE_META } from "@/lib/taxonomy";

const initial: CurationState = { error: null, ok: null };

export function RejectDiffForm({ changeId }: { changeId: string }) {
  const [state, action, pending] = useActionState(rejectChangeAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet btn-quiet-sm" onClick={() => setOpen(true)}>
        Reject as noise
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-3">
      <input type="hidden" name="changeId" value={changeId} />
      <label className="block flex-1">
        <span className="t-label">Why</span>
        <input
          className="input mt-2"
          name="reason"
          required
          placeholder="Header reworded; no requirement text changed"
        />
      </label>
      <button type="submit" className="btn btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Reject"}
      </button>
      {state.error && (
        <p className="t-secondary w-full" role="alert" style={{ color: "var(--color-signal-red)" }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary w-full" style={{ color: "var(--color-brick)" }}>
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function AssignJobTypeForm({ changeId }: { changeId: string }) {
  return (
    <form action={assignChangeJobTypeAction} className="mt-2 flex flex-wrap items-end gap-3">
      <input type="hidden" name="changeId" value={changeId} />
      <label className="block">
        <span className="t-label">Affects</span>
        <select className="input mt-2" name="jobType" defaultValue="hvac_changeout">
          {JOB_TYPES.map((code) => (
            <option key={code} value={code}>
              {JOB_TYPE_META[code].label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="btn btn-secondary">
        Attach job type
      </button>
    </form>
  );
}
