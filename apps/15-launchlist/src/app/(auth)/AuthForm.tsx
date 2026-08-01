"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "./actions";

export function AuthForm({
  mode,
  action,
}: {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const isSignup = mode === "signup";

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isSignup ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="t-label">Your name</span>
          <input className="input" name="name" autoComplete="name" placeholder="Sofia Marchetti" />
        </label>
      ) : null}

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Email</span>
        <input
          className="input input-mono"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="t-label">Password</span>
        <input
          className="input"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder={isSignup ? "At least 8 characters" : ""}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" role="alert" style={{ color: "var(--color-red)" }}>
          {state.error}
        </p>
      ) : null}

      <button className="btn btn-primary btn-full" type="submit" disabled={pending}>
        {pending ? "One moment…" : isSignup ? "Start a waitlist — free" : "Sign in"}
      </button>

      <p className="t-secondary" style={{ textAlign: "center" }}>
        {isSignup ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Start a waitlist — free</Link>
          </>
        )}
      </p>
    </form>
  );
}
