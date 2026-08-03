"use client";

import { useActionState } from "react";
import { IconAlert, IconMic } from "@/components/icons";
import { createJobAndCaptureAction, type NewJobState } from "../actions";

export function NewJobForm() {
  const [state, formAction, pending] = useActionState<NewJobState, FormData>(
    createJobAndCaptureAction,
    {},
  );

  return (
    <form action={formAction} style={{ display: "grid", gap: 16, paddingBottom: 24 }}>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Homeowner</span>
        <input
          className="field"
          name="customerName"
          placeholder="Marisol Vance"
          autoComplete="off"
          required
        />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Job address</span>
        <input
          className="field"
          name="address"
          placeholder="4412 Ramsey Ave, Austin, TX 78756"
          autoComplete="off"
          required
        />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">What is the job</span>
        <input className="field" name="title" placeholder="Condenser changeout" autoComplete="off" />
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Email for the proposal</span>
        <input
          className="field"
          name="customerEmail"
          type="email"
          inputMode="email"
          placeholder="marisol@example.com"
          autoComplete="off"
        />
        <span className="t-secondary" style={{ color: "var(--color-text-3)" }}>
          Where the proposal link goes. You can add it later, before you send.
        </span>
      </label>
      <label style={{ display: "grid", gap: 8 }}>
        <span className="t-label">Phone</span>
        <input
          className="field"
          name="customerPhone"
          inputMode="tel"
          placeholder="(512) 555-0177"
          autoComplete="off"
        />
      </label>

      {state.error ? (
        <p
          className="t-secondary"
          role="alert"
          style={{ color: "var(--color-red)", display: "flex", gap: 8 }}
        >
          <IconAlert size={18} />
          <span>{state.error}</span>
        </p>
      ) : null}

      <div className="thumb-bar">
        <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
          <IconMic size={18} />
          {pending ? "Opening capture…" : "Start walkthrough"}
        </button>
      </div>
    </form>
  );
}
