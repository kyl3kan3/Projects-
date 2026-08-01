"use client";

import { useActionState } from "react";
import { createFromTemplateAction, type WaiverFormState } from "./actions";
import { TEMPLATES, TEMPLATE_DISCLAIMER } from "@/lib/templates";

export function NewWaiverForm() {
  const [state, action, pending] = useActionState<WaiverFormState, FormData>(
    createFromTemplateAction,
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="t-label">Activity template</span>
        <select name="template" className="input" defaultValue="climbing">
          {TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-2">
        <span className="t-label">Title</span>
        <input
          name="title"
          className="input"
          placeholder="Saturday intro session waiver"
        />
      </label>

      <p className="t-secondary">{TEMPLATE_DISCLAIMER}</p>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-ember)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create the draft"}
      </button>
    </form>
  );
}
