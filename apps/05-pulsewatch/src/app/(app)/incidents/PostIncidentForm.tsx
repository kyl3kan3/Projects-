"use client";

import { useActionState } from "react";
import type { IncidentFormState } from "./actions";

export function PostIncidentForm({
  action,
}: {
  action: (prev: IncidentFormState, form: FormData) => Promise<IncidentFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Title</span>
        <input
          className="input"
          name="title"
          required
          placeholder="Elevated error rates on checkout"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">What is happening</span>
        <textarea
          className="input"
          name="body"
          rows={3}
          required
          placeholder="Our payments provider is returning 503s. Orders are queued, nothing is lost. Next update in 30 minutes."
        />
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="t-secondary" style={{ color: "var(--color-phosphor)" }} role="status">
          Posted. It is live on your status pages.
        </p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post incident"}
      </button>
    </form>
  );
}
