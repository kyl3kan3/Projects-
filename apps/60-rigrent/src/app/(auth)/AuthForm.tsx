"use client";

/**
 * The sign-in and sign-up form. One component for both, because they differ by
 * two fields and a verb, and two near-identical forms drift apart.
 */

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import type { FormState } from "@/lib/form";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  // Echoed values, so a rejected submit does not wipe what was typed.
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <ActionForm
      action={action}
      submitLabel={mode === "signup" ? "Start free — 14 days" : "Sign in"}
      pendingLabel={mode === "signup" ? "Setting up the yard…" : "Signing in…"}
      onState={(state) => {
        if (state.values) setValues(state.values);
      }}
    >
      {mode === "signup" ? (
        <>
          <label className="field">
            <span className="field-label">Your name</span>
            <input
              className="input"
              name="name"
              autoComplete="name"
              required
              defaultValue={values.name ?? ""}
              placeholder="Dale Whitcomb"
            />
            <span className="field-help">This goes on the contracts your customers sign.</span>
          </label>
          <label className="field">
            <span className="field-label">Yard name</span>
            <input
              className="input"
              name="yardName"
              defaultValue={values.yardName ?? ""}
              placeholder="Whitcomb Party Rentals"
            />
          </label>
        </>
      ) : null}

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={values.email ?? ""}
          placeholder="dale@whitcombrentals.com"
        />
      </label>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
        />
        {mode === "signup" ? (
          <span className="field-help">At least 8 characters. No card needed for the trial.</span>
        ) : null}
      </label>
    </ActionForm>
  );
}
