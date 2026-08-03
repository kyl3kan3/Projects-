"use client";

/**
 * The sign-up / sign-in form. One component, two modes — the fields and the copy are
 * the only difference, and duplicating a password field is how the two drift.
 */

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction, type AuthFormState } from "./actions";

const initial: AuthFormState = { error: null };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action, pending] = useActionState(
    mode === "signup" ? signupAction : loginAction,
    initial,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {mode === "signup" ? (
        <label className="block">
          <span className="t-label">Business name</span>
          <input
            className="input mt-2"
            name="business"
            type="text"
            autoComplete="organization"
            placeholder="Vasquez Plumbing"
          />
        </label>
      ) : null}

      <label className="block">
        <span className="t-label">Email</span>
        <input
          className="input mt-2"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourbusiness.com"
        />
      </label>

      <label className="block">
        <span className="t-label">Password</span>
        <input
          className="input mt-2"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : ""}
        />
      </label>

      {state.error ? (
        <p className="t-secondary" style={{ color: "var(--color-red)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full mt-2" disabled={pending}>
        {pending ? "One moment…" : mode === "signup" ? "Start closing your books" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {mode === "signup" ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Start closing your books</Link>
          </>
        )}
      </p>
    </form>
  );
}
