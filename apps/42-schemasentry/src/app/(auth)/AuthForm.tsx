"use client";

/**
 * The sign-in / sign-up form. The primary action sits in the thumb zone and is
 * full width; errors render above the button in break, as text, never as a
 * colour change alone.
 */

import Link from "next/link";
import { useActionState } from "react";
import type { AuthState } from "@/lib/form-state";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthState, form: FormData) => Promise<AuthState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const isSignup = mode === "signup";

  return (
    <form action={formAction} style={{ display: "grid", gap: 20 }}>
      {isSignup ? (
        <label className="field">
          <span className="t-label">Team or company</span>
          <input
            className="input"
            name="organization"
            type="text"
            autoComplete="organization"
            placeholder="Northwind Platform"
          />
          <span className="field-hint">
            Becomes the path on your public changelog pages. You can change it later.
          </span>
        </label>
      ) : null}

      <label className="field">
        <span className="t-label">Work email</span>
        <input
          className="input"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="dana@northwind.dev"
        />
      </label>

      <label className="field">
        <span className="t-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder={isSignup ? "At least 8 characters" : ""}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="t-secondary"
          style={{ color: "var(--color-break-text)", margin: 0 }}
        >
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
        {pending ? "Working…" : isSignup ? "Start watching an API" : "Sign in"}
      </button>

      <p className="t-secondary" style={{ margin: 0, textAlign: "center" }}>
        {isSignup ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Start a 14-day trial</Link>
          </>
        )}
      </p>
    </form>
  );
}
