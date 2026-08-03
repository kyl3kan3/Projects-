"use client";

import { useActionState } from "react";
import { createPropertyAction, type PropertyState } from "./actions";

const INITIAL: PropertyState = { error: null, ok: null };

export function NewPropertyForm({ defaultKind }: { defaultKind: "property" | "project" }) {
  const [state, action, pending] = useActionState(createPropertyAction, INITIAL);
  return (
    <form action={action} style={{ marginTop: 12, maxWidth: 560 }}>
      <div className="field">
        <label className="field-label" htmlFor="p-name">
          Name
        </label>
        <input
          id="p-name"
          name="name"
          className="input"
          required
          placeholder="Bayview Terrace"
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="p-kind">
          Kind
        </label>
        <select id="p-kind" name="kind" className="input" defaultValue={defaultKind}>
          <option value="property">Property</option>
          <option value="project">Project</option>
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="p-address">
          Address or description
        </label>
        <input
          id="p-address"
          name="address"
          className="input"
          placeholder="2214 SE Bayview Ave, Portland, OR 97202 — 96 units"
        />
      </div>
      {state.error && (
        <p className="field-error" role="alert" style={{ marginBottom: 12 }}>
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="t-secondary" role="status" style={{ marginBottom: 12 }}>
          {state.ok}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add property"}
      </button>
    </form>
  );
}
