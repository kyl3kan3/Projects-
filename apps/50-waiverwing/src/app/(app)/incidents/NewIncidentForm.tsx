"use client";

import { useActionState } from "react";
import { createIncidentAction, type IncidentFormState } from "./actions";

/** What / when / where, then linking via the same search (DESIGN.md). */
export function NewIncidentForm({ defaultLocal }: { defaultLocal: string }) {
  const [state, action, pending] = useActionState<IncidentFormState, FormData>(
    createIncidentAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">What happened — one line</span>
        <input
          name="title"
          className="input"
          required
          placeholder="Fall from the auto-belay at wall 4"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">When</span>
        <input
          name="occurredAt"
          type="datetime-local"
          className="input input-mono"
          defaultValue={defaultLocal}
          required
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Where</span>
        <input name="whereText" className="input" placeholder="Wall 4, auto-belay 2" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">The account</span>
        <textarea
          name="description"
          className="input"
          rows={6}
          required
          placeholder="Write what you saw and what was done, in order, while it is fresh. This is the file an insurer or an attorney will read."
        />
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-ember)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Logging…" : "Log the incident"}
      </button>
      <p className="t-secondary">
        Next you will link the people involved. Each link snapshots the waiver that was in force
        at the time above — later re-signs never change this file.
      </p>
    </form>
  );
}
