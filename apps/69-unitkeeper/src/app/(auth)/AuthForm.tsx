"use client";

import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import type { FormState } from "@/lib/form";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: FormState, form: FormData) => Promise<FormState>;
}) {
  const signup = mode === "signup";
  return (
    <ActionForm action={action} submitLabel={signup ? "Start free — 14 days" : "Sign in"}>
      {signup ? (
        <label className="field">
          <span className="field-label">Facility owner or company</span>
          <input
            className="input"
            name="name"
            autoComplete="organization"
            placeholder="Riverbend Storage LLC"
          />
          <span className="field-help">Printed on leases and notices. You can change it later.</span>
        </label>
      ) : null}

      <label className="field">
        <span className="field-label">Email</span>
        <input
          className="input"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@riverbendstorage.com"
        />
      </label>

      <label className="field">
        <span className="field-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={signup ? "new-password" : "current-password"}
        />
        {signup ? <span className="field-help">At least 8 characters.</span> : null}
      </label>

      <p className="t-secondary">
        {signup ? (
          <>
            No card for 14 days. Already have an account? <Link href="/login">Sign in</Link>.
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Start free — 14 days</Link>.
          </>
        )}
      </p>
    </ActionForm>
  );
}
