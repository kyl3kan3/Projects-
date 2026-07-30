"use client";

import { useActionState } from "react";
import type { StatusPageFormState } from "./actions";

export function NewStatusPageForm({
  action,
  monitors,
  statusBaseUrl,
  suggestedSlug,
}: {
  action: (prev: StatusPageFormState, form: FormData) => Promise<StatusPageFormState>;
  monitors: { id: string; name: string }[];
  statusBaseUrl: string;
  suggestedSlug: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Title</span>
        <input className="input" name="title" required placeholder="Helvetico Status" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Address</span>
        <input
          className="input input-mono"
          name="slug"
          required
          minLength={3}
          defaultValue={suggestedSlug}
          pattern="[a-zA-Z0-9-]+"
        />
        <span className="t-secondary">
          {statusBaseUrl}/status/<span className="t-data">your-slug</span>
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Description (optional)</span>
        <input
          className="input"
          name="description"
          placeholder="Live status for the Helvetico API and dashboard."
        />
      </label>

      <fieldset>
        <legend className="t-label mb-3">Which monitors to show</legend>
        {monitors.length === 0 ? (
          <p className="t-secondary">Add a monitor first — a status page with nothing on it says nothing.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {monitors.map((monitor) => (
              <label key={monitor.id} className="flex items-center gap-3">
                <input type="checkbox" name="monitorIds" value={monitor.id} className="size-5" />
                <span className="t-body">{monitor.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.createdSlug ? (
        <p className="t-secondary" style={{ color: "var(--color-phosphor)" }} role="status">
          Published at {statusBaseUrl}/status/{state.createdSlug}
        </p>
      ) : null}

      <button
        className="btn btn-primary self-start"
        type="submit"
        disabled={pending || monitors.length === 0}
      >
        {pending ? "Creating…" : "Create status page"}
      </button>
    </form>
  );
}
