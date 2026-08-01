"use client";

import { useActionState } from "react";
import { IconCheck } from "@/components/icons";
import type { SettingsFormState } from "./actions";

export function OrgForm({
  name,
  alertEmail,
  action,
}: {
  name: string;
  alertEmail: string;
  action: (prev: SettingsFormState, form: FormData) => Promise<SettingsFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Workspace name</span>
        <input className="input" name="name" defaultValue={name} maxLength={64} required />
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Alert address</span>
        <input
          className="input input-mono"
          name="alertEmail"
          type="email"
          defaultValue={alertEmail}
          placeholder="oncall@yourcompany.com"
        />
        <span className="t-secondary">
          Where a failed backup, a missed schedule, or a failed drill is sent. A distribution list is
          a better idea than one person&rsquo;s inbox.
        </span>
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-torch)" }} role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p
          className="t-secondary flex items-center gap-2"
          style={{ color: "var(--color-seal)" }}
          role="status"
        >
          <IconCheck size={16} />
          Saved.
        </p>
      ) : null}

      <button className="btn btn-secondary btn-full" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
