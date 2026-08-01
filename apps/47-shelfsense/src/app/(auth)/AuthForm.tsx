"use client";

/**
 * The sign-up / sign-in form. One component, two modes — the fields and the copy
 * are the only difference, and duplicating a password field is how the two drift.
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
          <span className="t-label">Your name</span>
          <input
            className="input mt-2"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="Ruth Oyelaran"
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
          placeholder="you@yourstore.com"
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
        <p className="t-secondary" style={{ color: "var(--color-rust)" }} role="alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn btn-primary btn-full mt-2" disabled={pending}>
        {pending ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p className="t-secondary text-center">
        {mode === "signup" ? (
          <>
            Already set up? <Link href="/login">Sign in</Link>
          </>
        ) : (
          <>
            No account yet? <Link href="/signup">Create one</Link>
          </>
        )}
      </p>
    </form>
  );
}
