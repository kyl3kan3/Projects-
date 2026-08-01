"use client";

import { useActionState } from "react";
import {
  createMenuAction,
} from "./actions";
import { EMPTY_FORM } from "./state";
import { IconPlus } from "@/components/icons";

export function NewMenuForm() {
  const [state, action, pending] = useActionState(createMenuAction, EMPTY_FORM);
  return (
    <form action={action} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span className="t-label">Menu name</span>
        <input className="input" name="name" placeholder="Dinner" required />
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Served from</span>
          <input className="input input-data" name="start" type="time" />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="t-label">Until</span>
          <input className="input input-data" name="end" type="time" />
        </label>
      </div>
      <p className="t-secondary" style={{ margin: 0 }}>
        Leave the times blank if it&apos;s the only menu.
      </p>
      {state.error ? (
        <p className="t-secondary" role="alert" style={{ margin: 0, color: "#c05a3e" }}>
          {state.error}
        </p>
      ) : null}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        <IconPlus size={18} /> {pending ? "Adding…" : "Add menu"}
      </button>
    </form>
  );
}
