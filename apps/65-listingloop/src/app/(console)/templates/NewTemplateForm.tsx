"use client";

import { useActionState } from "react";
import { createTemplateAction, type TemplateState } from "./actions";
import { CONTRACT_TYPE_LABELS } from "@/lib/templates";

const initial: TemplateState = { error: null, ok: null };

export function NewTemplateForm() {
  const [state, action, pending] = useActionState(createTemplateAction, initial);
  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="field-label">Contract type</span>
        <select className="input" name="contractType" defaultValue="buyer">
          {Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block min-w-56 flex-1">
        <span className="field-label">Name</span>
        <input className="input" name="name" placeholder="Buyer side — new construction" />
      </label>
      <button className="btn btn-secondary" type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create"}
      </button>
      {state.error ? (
        <p className="field-error w-full" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
